<?php
if ( ! defined( 'ABSPATH' ) ) die( header( 'HTTP/1.0 403 Forbidden' ) );
/**
 * Mailcatcher class. Based on VCCW code.
 *
 * @since 0.1.0
 * @package Mailcatcher
 */
class VCCW_MailCatcher
{
	/**
	 * Send in arguments for mailer.
	 *
	 * @since 0.1.0
	 * @access public
	 * @param array $config Configuration values. These will take presedence over $defaults.
	 */
	public function __construct( array $config = array() )
	{
		if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
			return;
		}
		// Setup our defaults
		$defaults = array(
			"host"     => "127.0.0.1",
			"port"     => "1025",
			"smtpauth" => false
		 );
		$config = wp_parse_args( $config, $defaults );
		$this->setupMail( $config );
	}
	/**
	 * Setup mailer.
	 *
	 * @since 0.1.0
	 * @access private
	 * @param array $config Parsed configuration values.
	 */
	private function setupMail( array $config )
	{
		add_action( 'phpmailer_init', function( $phpmailer ) use( $config ) {
			extract( $config, EXTR_SKIP );
			$phpmailer->Host     = $host;
			$phpmailer->Port     = ( int ) $port;
			$phpmailer->SMTPAuth = ( boolean ) $smtpauth;
			$phpmailer->isSMTP();
		} );
	}
}
$mailcatcher = new VCCW_MailCatcher();
