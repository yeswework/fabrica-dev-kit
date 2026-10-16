<?php
// `fdk seed`'s live half over SSH, run with `wp eval-file -`. `$input` is set before this runs:
// { types, options }. Selects as Fabrica Export does (plugins/fabrica-export/inc/base.php) and
// prints the rows as stored, so meta and options reach the local site byte for byte. Reads only
global $wpdb;

$stylesheet = get_stylesheet();
$snapshot = ['source' => ['home' => get_option('home'), 'siteurl' => get_option('siteurl'), 'stylesheet' => $stylesheet],
	'posts' => [], 'meta' => [], 'terms' => [], 'relationships' => [], 'comments' => [], 'users' => [], 'options' => [],
	'menuLocations' => (object) [], 'gaps' => []];
$intList = function ($ids) { return implode(',', array_map('intval', $ids)); };
// active theme only, as WordPress itself reads them
$themed = $wpdb->prepare(
	"ID in (select tr.object_id from {$wpdb->term_relationships} tr
	join {$wpdb->term_taxonomy} tt on tt.term_taxonomy_id = tr.term_taxonomy_id and tt.taxonomy = 'wp_theme'
	join {$wpdb->terms} t on t.term_id = tt.term_id and t.slug = %s)", $stylesheet);

$posts = [];
foreach ($input['types'] as $type => $filter) {
	$where = $wpdb->prepare("post_type = %s and post_status not in ('draft', 'auto-draft', 'trash')", $type);
	if (in_array($type, ['wp_template', 'wp_template_part', 'wp_global_styles'], true)) { $where .= " and {$themed}"; }
	if (!empty($filter['months'])) {
		$where .= $wpdb->prepare(' and post_date > %s', date('Y-m-d', strtotime("-{$filter['months']} months")));
	}
	if (!empty($filter['ids'])) { $where .= " and ID in ({$intList($filter['ids'])})"; }
	$sql = "select * from {$wpdb->posts} where {$where} order by post_date desc";
	if (!empty($filter['limit'])) { $sql .= $wpdb->prepare(' limit %d', $filter['limit']); }
	foreach ($wpdb->get_results($sql, ARRAY_A) as $row) { $posts[$row['ID']] = $row; }
}
// parents, as Fabrica Export adds them
while ($missing = array_diff(array_unique(array_filter(array_column($posts, 'post_parent'))), array_keys($posts))) {
	$found = $wpdb->get_results("select * from {$wpdb->posts} where ID in ({$intList($missing)}) and post_status not in ('auto-draft', 'trash')", ARRAY_A);
	foreach ($found as $row) { $posts[$row['ID']] = $row; }
	if (!$found) { break; }
}

// attachments rendered by ID: featured images, `wp-image-<id>` in content, the site icon and logo
$media = [get_option('site_icon'), get_option('site_logo')];
if ($posts) {
	$media = array_merge($media, $wpdb->get_col("select meta_value from {$wpdb->postmeta} where meta_key = '_thumbnail_id' and post_id in ({$intList(array_keys($posts))})"));
}
foreach ($posts as $row) {
	preg_match_all('/\bwp-image-(\d+)\b/', $row['post_content'], $matches);
	$media = array_merge($media, $matches[1]);
}
$media = array_diff(array_filter(array_map('intval', $media)), array_keys($posts));
if ($media) {
	foreach ($wpdb->get_results("select * from {$wpdb->posts} where post_type = 'attachment' and ID in ({$intList($media)})", ARRAY_A) as $row) {
		$posts[$row['ID']] = $row;
	}
}
$snapshot['posts'] = array_values($posts);
$ids = array_keys($posts);

if ($ids) {
	foreach ($wpdb->get_results("select post_id, meta_key, meta_value from {$wpdb->postmeta} where post_id in ({$intList($ids)}) and meta_key not in ('_edit_lock', '_edit_last')", ARRAY_A) as $meta) {
		$snapshot['meta'][] = ['post_id' => (int) $meta['post_id'], 'key' => $meta['meta_key'], 'raw' => $meta['meta_value']];
	}

	$termSql = "select t.term_id, t.name, t.slug, tt.taxonomy, tt.description, tt.parent from {$wpdb->terms} t join {$wpdb->term_taxonomy} tt on tt.term_id = t.term_id";
	$terms = [];
	foreach ($wpdb->get_results("select tr.object_id, tt.taxonomy, t.slug from {$wpdb->term_relationships} tr
		join {$wpdb->term_taxonomy} tt on tt.term_taxonomy_id = tr.term_taxonomy_id
		join {$wpdb->terms} t on t.term_id = tt.term_id where tr.object_id in ({$intList($ids)})", ARRAY_A) as $relationship) {
		$snapshot['relationships'][] = ['object_id' => (int) $relationship['object_id'], 'taxonomy' => $relationship['taxonomy'], 'slug' => $relationship['slug']];
	}
	$termIds = $wpdb->get_col("select distinct tt.term_id from {$wpdb->term_relationships} tr
		join {$wpdb->term_taxonomy} tt on tt.term_taxonomy_id = tr.term_taxonomy_id where tr.object_id in ({$intList($ids)})");
	// and their parents, so the hierarchy holds
	while ($termIds) {
		$found = $wpdb->get_results("{$termSql} where t.term_id in ({$intList($termIds)})", ARRAY_A);
		foreach ($found as $term) { $terms[$term['term_id']] = $term; }
		$termIds = array_diff(array_unique(array_filter(array_column($found, 'parent'))), array_keys($terms));
	}
	foreach ($terms as $term) {
		$snapshot['terms'][] = ['term_id' => (int) $term['term_id'], 'taxonomy' => $term['taxonomy'], 'slug' => $term['slug'], 'name' => $term['name'],
			'description' => $term['description'], 'parent' => $term['parent'] ? ($terms[$term['parent']]['slug'] ?? null) : null];
	}

	$snapshot['comments'] = $wpdb->get_results("select * from {$wpdb->comments} where comment_post_ID in ({$intList($ids)}) and comment_approved in ('0', '1')", ARRAY_A);

	$authors = array_filter(array_unique(array_merge(array_column($posts, 'post_author'), array_column($snapshot['comments'], 'user_id'))));
	if ($authors) {
		foreach ($wpdb->get_results("select ID, user_login, user_nicename, display_name, user_registered from {$wpdb->users} where ID in ({$intList($authors)})", ARRAY_A) as $user) {
			$user['roles'] = array_values(get_userdata($user['ID'])->roles);
			$snapshot['users'][] = $user;
		}
	}
}

foreach ($wpdb->get_results("select option_name, option_value from {$wpdb->options} where option_name in ('" . implode("','", array_map('esc_sql', $input['options'])) . "')", ARRAY_A) as $option) {
	$snapshot['options'][] = ['name' => $option['option_name'], 'raw' => $option['option_value']];
}

if (isset($input['types']['nav_menu_item'])) {
	$locations = [];
	foreach (get_nav_menu_locations() as $location => $termId) {
		$menu = get_term($termId, 'nav_menu');
		if (!$menu || is_wp_error($menu)) { continue; }
		$locations[$location] = ['taxonomy' => 'nav_menu', 'slug' => $menu->slug];
		$snapshot['terms'][] = ['term_id' => (int) $menu->term_id, 'taxonomy' => 'nav_menu', 'slug' => $menu->slug, 'name' => $menu->name, 'description' => $menu->description];
	}
	$snapshot['menuLocations'] = (object) $locations;
}

echo "\nFDK-SEED " . wp_json_encode($snapshot) . "\n";
