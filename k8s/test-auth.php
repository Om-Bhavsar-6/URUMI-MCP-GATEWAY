<?php
$_SERVER['HTTPS'] = 'on';
$_SERVER['REQUEST_URI'] = '/wp-json/wc/v3/products';
require_once __DIR__ . '/wp-load.php';

global $wpdb;
$table = $wpdb->prefix . 'woocommerce_api_keys';
$rows = $wpdb->get_results("SELECT key_id, user_id, permissions, consumer_key, consumer_secret, truncated_key FROM $table");
echo "=== Stored Keys ===\n";
print_r($rows);

$key = 'ck_urumi_live_test_key_123';
$secret = 'cs_urumi_live_test_secret_123';
$hash = hash_hmac('sha256', $key, 'wc-api');

echo "Calculated hash: $hash\n";
$auth = new WC_REST_Authentication();
echo "Is SSL: " . (is_ssl() ? 'YES' : 'NO') . "\n";
echo "Testing authentication method...\n";
$_SERVER['PHP_AUTH_USER'] = $key;
$_SERVER['PHP_AUTH_PW'] = $secret;
$user = $auth->authenticate(false);
echo "Auth result: ";
var_dump($user);
