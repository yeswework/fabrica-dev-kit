<?php
// `fdk seed`'s local half, run with `wp eval-file -` in the project's `wp` container. `$input` is set
// before this runs: { snapshot, replace, check }. Rows go in directly with live's IDs, so every
// reference between posts resolves unchanged; wp_insert_post can't keep an ID, and would run
// content through kses and save filters besides
global $wpdb;

$snapshot = $input['snapshot'];
$report = ['clashes' => [], 'remapped' => [], 'home' => get_option('home')];

// WordPress finds these by theme and slug, so an existing local one is the post to overwrite, whatever
// its ID: a second copy would leave which one wins to query order
$themed = ['wp_template', 'wp_template_part', 'wp_global_styles'];
$themeOf = [];
foreach ($snapshot['relationships'] as $relationship) {
	if ($relationship['taxonomy'] === 'wp_theme') { $themeOf[$relationship['object_id']] = $relationship['slug']; }
}
$targets = []; // live ID → local ID
foreach ($snapshot['posts'] as $post) {
	$id = (int) $post['ID'];
	$targets[$id] = $id;
	if (in_array($post['post_type'], $themed, true) && isset($themeOf[$id])) {
		$local = $wpdb->get_var($wpdb->prepare(
			"select p.ID from {$wpdb->posts} p
			join {$wpdb->term_relationships} tr on tr.object_id = p.ID
			join {$wpdb->term_taxonomy} tt on tt.term_taxonomy_id = tr.term_taxonomy_id and tt.taxonomy = 'wp_theme'
			join {$wpdb->terms} t on t.term_id = tt.term_id and t.slug = %s
			where p.post_type = %s and p.post_name = %s order by p.ID limit 1",
			$themeOf[$id], $post['post_type'], $post['post_name']
		));
		if ($local) { $targets[$id] = (int) $local; }
	}
}

$titles = array_column($snapshot['posts'], 'post_title', 'ID');
$types = array_column($snapshot['posts'], 'post_type', 'ID');
// a themed post takes its local match's ID, which another live post can hold as its own: both would
// be written into the one row, so neither --replace nor a clash report can settle it
$report['collisions'] = [];
foreach (array_count_values($targets) as $target => $count) {
	if ($count < 2) { continue; }
	$report['collisions'][] = ['ID' => (int) $target, 'posts' => array_map(function ($live) use ($types, $titles) {
		return ['ID' => (int) $live, 'type' => $types[$live], 'title' => $titles[$live]];
	}, array_keys($targets, $target, true))];
}
if ($targets) {
	$taken = $wpdb->get_results("select ID, post_type, post_title from {$wpdb->posts} where ID in (" . implode(',', array_unique($targets)) . ')', ARRAY_A);
	$liveOf = array_flip($targets);
	foreach ($taken as $row) {
		$live = $liveOf[(int) $row['ID']];
		$report['clashes'][] = ['ID' => (int) $row['ID'], 'live' => (int) $live, 'type' => $types[$live], 'title' => $titles[$live],
			'local_type' => $row['post_type'], 'local_title' => $row['post_title']];
	}
}
$commentIds = array_map('intval', array_column($snapshot['comments'], 'comment_ID'));
$report['commentClashes'] = $commentIds
	? array_map('intval', $wpdb->get_col("select comment_ID from {$wpdb->comments} where comment_ID in (" . implode(',', $commentIds) . ')'))
	: [];

if ($input['check'] || $report['collisions'] || (($report['clashes'] || $report['commentClashes']) && !$input['replace'])) {
	echo "\nFDK-SEED " . wp_json_encode($report) . "\n";
	return;
}

// Authors: the local user of the same login, else live's user under live's ID where it's free
$users = [];
foreach ($snapshot['users'] as $user) {
	$id = (int) $user['ID'];
	$local = get_user_by('login', $user['user_login']);
	if ($local) {
		$users[$id] = $local->ID;
		continue;
	}
	// never live's address: anything the local site sends, a password reset or a comment notice, must not reach a real person
	$row = ['user_login' => $user['user_login'], 'user_pass' => wp_hash_password(wp_generate_password(24)), 'user_nicename' => $user['user_nicename'],
		'user_email' => "{$user['user_login']}@example.invalid", 'display_name' => $user['display_name'],
		'user_registered' => $user['user_registered'] ?: current_time('mysql', true)];
	if (get_userdata($id)) {
		$wpdb->insert($wpdb->users, $row);
		$users[$id] = (int) $wpdb->insert_id;
		$report['remapped'][] = "Author '{$user['user_login']}' is user {$users[$id]} here: live's ID {$id} is taken.";
	} else {
		$wpdb->insert($wpdb->users, ['ID' => $id] + $row);
		$users[$id] = $id;
	}
	clean_user_cache($users[$id]);
	(new WP_User($users[$id]))->set_role($user['roles'][0] ?? 'subscriber');
}

// Terms by taxonomy and slug: an existing local one is reused, a new one keeps live's ID where free
$termsByKey = [];
foreach ($snapshot['terms'] as $term) { $termsByKey["{$term['taxonomy']}:{$term['slug']}"] = $term; }
$localTerms = [];
$ensureTerm = function ($taxonomy, $slug) use (&$ensureTerm, &$localTerms, &$report, $termsByKey, $wpdb) {
	$key = "{$taxonomy}:{$slug}";
	if (isset($localTerms[$key])) { return $localTerms[$key]; }
	$found = $wpdb->get_row($wpdb->prepare(
		"select t.term_id, tt.term_taxonomy_id from {$wpdb->terms} t join {$wpdb->term_taxonomy} tt on tt.term_id = t.term_id
		where tt.taxonomy = %s and t.slug = %s", $taxonomy, $slug), ARRAY_A);
	if (!$found) {
		$term = $termsByKey[$key] ?? ['name' => $slug, 'description' => ''];
		$parent = empty($term['parent']) ? 0 : $ensureTerm($taxonomy, $term['parent'])['term_id'];
		$row = ['name' => $term['name'], 'slug' => $slug, 'term_group' => 0];
		$free = !empty($term['term_id']) && !$wpdb->get_var($wpdb->prepare("select term_id from {$wpdb->terms} where term_id = %d", $term['term_id']));
		$wpdb->insert($wpdb->terms, $free ? ['term_id' => (int) $term['term_id']] + $row : $row);
		$termId = (int) $wpdb->insert_id;
		if (!empty($term['term_id']) && !$free) {
			$report['remapped'][] = "Term '{$slug}' ({$taxonomy}) is {$termId} here: live's ID {$term['term_id']} is taken, so blocks naming it by ID won't find it.";
		}
		$wpdb->insert($wpdb->term_taxonomy, ['term_id' => $termId, 'taxonomy' => $taxonomy, 'description' => $term['description'], 'parent' => $parent, 'count' => 0]);
		$found = ['term_id' => $termId, 'term_taxonomy_id' => (int) $wpdb->insert_id];
	}
	return $localTerms[$key] = array_map('intval', $found);
};

$ids = array_values(array_unique($targets));
$list = implode(',', $ids);
// what these posts held before is theirs to replace; nothing else is touched
$wpdb->query("delete from {$wpdb->postmeta} where post_id in ({$list})");
$wpdb->query("delete from {$wpdb->term_relationships} where object_id in ({$list})");

$columns = ['post_author' => 0, 'post_date' => null, 'post_date_gmt' => null, 'post_content' => '', 'post_title' => '', 'post_excerpt' => '',
	'post_status' => 'publish', 'comment_status' => 'closed', 'ping_status' => 'closed', 'post_password' => '', 'post_name' => '', 'to_ping' => '',
	'pinged' => '', 'post_modified' => null, 'post_modified_gmt' => null, 'post_content_filtered' => '', 'post_parent' => 0, 'guid' => '',
	'menu_order' => 0, 'post_type' => 'post', 'post_mime_type' => '', 'comment_count' => 0];
foreach ($snapshot['posts'] as $post) {
	$row = array_merge($columns, array_intersect_key(array_filter($post, function ($value) { return $value !== null; }), $columns));
	$row['ID'] = $targets[(int) $post['ID']];
	$row['post_author'] = $users[(int) $row['post_author']] ?? (int) $row['post_author'];
	$row['post_parent'] = $targets[(int) $row['post_parent']] ?? (int) $row['post_parent'];
	$row['post_modified'] = $row['post_modified'] ?? $row['post_date'] ?? current_time('mysql');
	$row['post_date'] = $row['post_date'] ?? $row['post_modified'];
	$row['post_modified_gmt'] = $row['post_modified_gmt'] ?? get_gmt_from_date($row['post_modified']);
	$row['post_date_gmt'] = $row['post_date_gmt'] ?? get_gmt_from_date($row['post_date']);
	if ($row['post_type'] === 'wp_global_styles') {
		$json = json_decode($row['post_content'], true);
		if (is_array($json) && !isset($json['version'])) {
			$json['version'] = WP_Theme_JSON::LATEST_SCHEMA;
			$row['post_content'] = wp_json_encode($json);
		}
	}
	$wpdb->replace($wpdb->posts, $row);
}

foreach ($snapshot['meta'] as $meta) {
	$id = $targets[(int) $meta['post_id']] ?? null;
	if (!$id) { continue; }
	// raw: the database's own string, read over SSH; value: decoded, read over REST
	$value = array_key_exists('raw', $meta) ? $meta['raw'] : maybe_serialize($meta['value']);
	$wpdb->insert($wpdb->postmeta, ['post_id' => $id, 'meta_key' => $meta['key'], 'meta_value' => $value]);
}

$counted = [];
foreach ($snapshot['relationships'] as $relationship) {
	$id = $targets[(int) $relationship['object_id']] ?? null;
	if (!$id || empty($relationship['slug'])) { continue; }
	$term = $ensureTerm($relationship['taxonomy'], $relationship['slug']);
	$wpdb->replace($wpdb->term_relationships, ['object_id' => $id, 'term_taxonomy_id' => $term['term_taxonomy_id'], 'term_order' => 0]);
	$counted[$relationship['taxonomy']][] = $term['term_taxonomy_id'];
}
// terms no post uses yet, such as an empty menu
foreach ($snapshot['terms'] as $term) { $ensureTerm($term['taxonomy'], $term['slug']); }
foreach ($counted as $taxonomy => $termTaxonomyIds) {
	$termTaxonomyIds = array_unique($termTaxonomyIds);
	if (taxonomy_exists($taxonomy)) {
		wp_update_term_count_now($termTaxonomyIds, $taxonomy);
	} else {
		foreach ($termTaxonomyIds as $ttId) {
			$wpdb->query($wpdb->prepare("update {$wpdb->term_taxonomy} set count = (select count(*) from {$wpdb->term_relationships} where term_taxonomy_id = %d) where term_taxonomy_id = %d", $ttId, $ttId));
		}
	}
}

$commentColumns = ['comment_post_ID' => 0, 'comment_author' => '', 'comment_author_email' => '', 'comment_author_url' => '', 'comment_author_IP' => '',
	'comment_date' => null, 'comment_date_gmt' => null, 'comment_content' => '', 'comment_karma' => 0, 'comment_approved' => '1', 'comment_agent' => '',
	'comment_type' => 'comment', 'comment_parent' => 0, 'user_id' => 0];
$commentedPosts = [];
foreach ($snapshot['comments'] as $comment) {
	$row = array_merge($commentColumns, array_intersect_key(array_filter($comment, function ($value) { return $value !== null; }), $commentColumns));
	$row['comment_ID'] = (int) $comment['comment_ID'];
	$row['comment_post_ID'] = $targets[(int) $row['comment_post_ID']] ?? (int) $row['comment_post_ID'];
	$row['user_id'] = $users[(int) $row['user_id']] ?? (int) $row['user_id'];
	$row['comment_date'] = $row['comment_date'] ?? current_time('mysql');
	$row['comment_date_gmt'] = $row['comment_date_gmt'] ?? get_gmt_from_date($row['comment_date']);
	$wpdb->replace($wpdb->comments, $row);
	$commentedPosts[$row['comment_post_ID']] = true;
}
foreach (array_keys($commentedPosts) as $id) { wp_update_comment_count_now($id); }

foreach ($snapshot['options'] as $option) {
	update_option($option['name'], array_key_exists('raw', $option) ? maybe_unserialize($option['raw']) : $option['value']);
}
// nothing in core rebuilds the rewrite rules when permalink_structure or the category and tag bases
// change, so links would 404 until Permalinks was saved again. Not rebuilt here: this request
// registered the taxonomies under the old bases. Without stored rules, the next request builds them
delete_option('rewrite_rules');
if ($snapshot['menuLocations']) {
	$locations = get_theme_mod('nav_menu_locations', []);
	foreach ($snapshot['menuLocations'] as $location => $menu) {
		$locations[$location] = $ensureTerm($menu['taxonomy'], $menu['slug'])['term_id'];
	}
	set_theme_mod('nav_menu_locations', $locations);
}

foreach ($ids as $id) { clean_post_cache($id); }
wp_cache_flush();
$report['written'] = count($ids);
echo "\nFDK-SEED " . wp_json_encode($report) . "\n";
