<?php
// k8s/seed-store.php
// Configures COD, WooCommerce REST API Key, and Seeds Initial Demo Products

echo "==> Configuring Cash On Delivery...\n";
update_option('woocommerce_cod_settings', [
    'enabled' => 'yes',
    'title' => 'Cash on Delivery',
    'description' => 'Pay with cash upon delivery.',
    'instructions' => 'Pay with cash upon delivery.',
    'enable_for_methods' => [],
    'enable_for_virtual' => 'yes'
]);
echo "COD payment gateway enabled.\n";

echo "==> Configuring WooCommerce REST API Key...\n";
$key = 'ck_urumi_live_test_key_123';
$secret = 'cs_urumi_live_test_secret_123';
$hash = hash_hmac('sha256', $key, 'wc-api');

global $wpdb;
$table = $wpdb->prefix . 'woocommerce_api_keys';
$wpdb->replace($table, [
    'user_id' => 1,
    'description' => 'Urumi MCP Gateway Key',
    'permissions' => 'read_write',
    'consumer_key' => $hash,
    'consumer_secret' => $secret,
    'truncated_key' => substr($key, -7),
    'last_access' => null
]);
echo "WooCommerce REST API Key registered successfully in DB.\n";

echo "==> Seeding Demo Products...\n";
$products = [
    [
        'name' => 'Urumi Developer Hoodie',
        'price' => '49.99',
        'description' => 'Premium heavyweight organic cotton hoodie for developers.'
    ],
    [
        'name' => 'Mechanical Keyboard',
        'price' => '89.99',
        'description' => 'Hot-swappable mechanical keyboard with custom switches.'
    ],
    [
        'name' => 'Ergonomic Desk Mat',
        'price' => '24.99',
        'description' => 'Waterproof micro-weave desk pad for precision control.'
    ]
];

foreach ($products as $p) {
    // Check if product already exists by title
    $existing = get_page_by_title($p['name'], OBJECT, 'product');
    if (!$existing) {
        $product = new WC_Product_Simple();
        $product->set_name($p['name']);
        $product->set_status('publish');
        $product->set_catalog_visibility('visible');
        $product->set_description($p['description']);
        $product->set_regular_price($p['price']);
        $product->set_price($p['price']);
        $id = $product->save();
        echo "Created Product: {$p['name']} (ID: {$id}, Price: \${$p['price']})\n";
    } else {
        echo "Product already exists: {$p['name']} (ID: {$existing->ID})\n";
    }
}

echo "==> WooCommerce Store Configuration Complete!\n";
