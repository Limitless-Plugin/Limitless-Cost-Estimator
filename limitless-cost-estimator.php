<?php
/**
 * Plugin Name:  Limitless Cost Estimator
 * Plugin URI:   https://limitlessbranding.co
 * Description:  A live DTF transfer cost estimator. Add it to any page with the shortcode [limitless_cost_estimator].
 * Version:      1.2.12
 * Author:       Limitless Branding Co
 * License:      GPL-2.0+
 * Text Domain:  limitless-cost-estimator
 */

// ──────────────────────────────────────────────────────────────
// Security: prevent direct file access.
// WordPress defines ABSPATH when it loads. If someone tries to
// open this file directly in a browser, we stop them here.
// ──────────────────────────────────────────────────────────────
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ──────────────────────────────────────────────────────────────
// Constants — handy shortcuts used throughout the plugin.
// ──────────────────────────────────────────────────────────────
define( 'LCE_VERSION',     '1.2.12' );
define( 'LCE_PLUGIN_URL',  plugin_dir_url( __FILE__ ) );   // URL  to this folder
define( 'LCE_PLUGIN_PATH', plugin_dir_path( __FILE__ ) );  // Path to this folder


// ══════════════════════════════════════════════════════════════
// SECTION 1 — FRONT-END ASSETS
// Tells WordPress to load our CSS and JS files on the front end.
// ══════════════════════════════════════════════════════════════

/**
 * Enqueue (register + load) the plugin's stylesheet and script.
 * Hooked to 'wp_enqueue_scripts' which runs on every front-end page.
 */
function lce_enqueue_assets() {

    // --- Stylesheet ---
    wp_enqueue_style(
        'limitless-cost-estimator',                               // Unique handle
        LCE_PLUGIN_URL . 'assets/css/limitless-cost-estimator.css',
        [],            // No dependencies
        LCE_VERSION    // Version string (helps bust browser cache on updates)
    );

    // --- JavaScript ---
    wp_enqueue_script(
        'limitless-cost-estimator',                               // Unique handle
        LCE_PLUGIN_URL . 'assets/js/limitless-cost-estimator.js',
        [],            // No dependencies (pure vanilla JS, no jQuery needed)
        LCE_VERSION,
        true           // Load in the <footer> so the HTML is ready before the script runs
    );
}
add_action( 'wp_enqueue_scripts', 'lce_enqueue_assets' );


// ══════════════════════════════════════════════════════════════
// SECTION 2 — SHORTCODE
// [limitless_cost_estimator] outputs the full calculator HTML.
// ══════════════════════════════════════════════════════════════

/**
 * Build and return the calculator HTML.
 * WordPress replaces [limitless_cost_estimator] in any post/page with this output.
 */
function lce_render_calculator() {

    // Fetch the admin-saved colors (falls back to brand defaults if not set).
    $c = lce_get_colors();

    // ob_start() captures everything echo'd between here and ob_get_clean(),
    // then returns it as a string — which is what shortcodes must return.
    ob_start();
    ?>

    <?php
    // Inject CSS custom properties so every color in our stylesheet is
    // overridden by whatever the admin chose in Settings.
    ?>
    <style>
        #lce-calculator {
            --lce-teal:    <?php echo esc_attr( $c['teal']    ); ?>;
            --lce-black:   <?php echo esc_attr( $c['black']   ); ?>;
            --lce-white:   <?php echo esc_attr( $c['white']   ); ?>;
            --lce-bg:      <?php echo esc_attr( $c['bg']      ); ?>;
            --lce-divider: <?php echo esc_attr( $c['divider'] ); ?>;
        }
    </style>

    <div class="lce-calculator" id="lce-calculator">

        <!-- ═══════════════════════════════════════════════════
             TOP ROW  —  Designs card (left) + Summary card (right)
             ═══════════════════════════════════════════════════ -->
        <div class="lce-top-row">

            <!-- ───────────────────────────────────────────────
                 LEFT CARD — "Your Designs"
                 ─────────────────────────────────────────────── -->
            <div class="lce-card lce-designs-card">

                <h2 class="lce-card-title">YOUR DESIGNS</h2>

                <!-- Scrollable table wrapper — allows horizontal scroll on
                     narrower screens so columns never collapse to zero width -->
                <div class="lce-table-scroll">

                    <!-- Column header row (hidden on mobile via CSS) -->
                    <div class="lce-table-header" aria-hidden="true">
                        <span></span><!-- spacer for the row-number badge -->
                        <span>Width (in)</span>
                        <span>Height (in)</span>
                        <span>Quantity</span>
                        <span>Linear Inches</span>
                        <span>Cost Per Transfer</span>
                        <span></span><!-- spacer for the delete button -->
                    </div>

                    <!-- Design rows are injected here by JavaScript -->
                    <div id="lce-design-rows"></div>

                </div><!-- /.lce-table-scroll -->

                <!-- Add Another Design button -->
                <button class="lce-add-btn" id="lce-add-design" type="button">
                    <span class="lce-add-icon" aria-hidden="true">+</span>
                    <span class="lce-add-text">
                        <span class="lce-add-label">ADD ANOTHER DESIGN</span>
                        <span class="lce-add-sub">Keep adding to see your pricing update</span>
                    </span>
                </button>

            </div><!-- /.lce-designs-card -->

            <!-- ───────────────────────────────────────────────
                 RIGHT CARD — "Estimate Summary"
                 ─────────────────────────────────────────────── -->
            <div class="lce-card lce-summary-card">

                <h2 class="lce-card-title">ESTIMATE SUMMARY</h2>

                <!-- Total Linear Inches -->
                <div class="lce-summary-block">
                    <p class="lce-summary-label">Total Linear Inches</p>
                    <p class="lce-summary-value lce-summary-large" id="lce-total-li">0 in</p>
                </div>

                <div class="lce-divider"></div>

                <!-- Price Tier -->
                <div class="lce-summary-block">
                    <p class="lce-summary-label">Price Tier (per linear inch)</p>
                    <div class="lce-tier-row">
                        <p class="lce-summary-value lce-summary-large" id="lce-price-per-in">$0.00</p>
                        <span class="lce-tier-badge" id="lce-tier-badge"></span>
                    </div>
                </div>

                <div class="lce-divider"></div>

                <!-- Estimated Total Cost -->
                <div class="lce-summary-block">
                    <p class="lce-summary-label">Estimated Total Cost</p>
                    <p class="lce-summary-value lce-summary-total" id="lce-total-cost">$0.00</p>
                </div>

                <!-- Free Shipping Area
                     Visibility and content controlled entirely by JavaScript.
                     Three possible states:
                       1. Hidden  — no valid inputs yet
                       2. Shipping due  — total < $50: shows "+ Shipping" + "Add $X more" note
                       3. Free shipping — total >= $50: shows the black qualified pill
                -->
                <div class="lce-shipping-area" id="lce-shipping-area" style="display:none;" aria-live="polite">

                    <!-- State 2: under $50 -->
                    <p class="lce-shipping-plus" id="lce-shipping-plus">+ Shipping</p>
                    <p class="lce-shipping-note" id="lce-shipping-note"></p>

                    <!-- State 3: $50 or more -->
                    <div class="lce-free-badge" id="lce-free-badge">QUALIFIES FOR FREE SHIPPING!</div>

                </div><!-- /.lce-shipping-area -->

                <p class="lce-realtime-note">
                    <span aria-hidden="true">&#9432;</span>
                    All calculations update in real time
                </p>

            </div><!-- /.lce-summary-card -->

        </div><!-- /.lce-top-row -->

        <!-- ═══════════════════════════════════════════════════
             BOTTOM SECTION  —  Pricing Tiers + Important Notes
             ═══════════════════════════════════════════════════ -->
        <div class="lce-bottom-section">

            <h3 class="lce-section-title">Pricing Tiers</h3>

            <div class="lce-bottom-row">

                <!-- Pricing tiers table (populated by JavaScript) -->
                <div class="lce-card lce-tiers-card">
                    <h4 class="lce-tiers-card-title">PRICING TIERS (TOTAL LINEAR INCH)</h4>
                    <div id="lce-tier-list" class="lce-tier-list"></div>
                </div>

                <!-- Important notes -->
                <div class="lce-card lce-notes-card">
                    <h4 class="lce-notes-title">IMPORTANT NOTES</h4>
                    <ul class="lce-notes-list">
                        <li>The prices shown are calculated estimations and are not guaranteed.</li>
                        <li>We account for a 0.25&Prime; gap in between each transfer.</li>
                        <li>Calculations are being made without nesting designs next to each other.</li>
                        <li>This tool is meant only for the &ldquo;Custom Length DTF Gang Sheet&rdquo;.</li>
                        <li>This will not work if you&rsquo;re building your gang sheet on the site.</li>
                    </ul>
                </div>

            </div><!-- /.lce-bottom-row -->

        </div><!-- /.lce-bottom-section -->

    </div><!-- /#lce-calculator -->

    <?php
    return ob_get_clean();
}
add_shortcode( 'limitless_cost_estimator', 'lce_render_calculator' );


// ══════════════════════════════════════════════════════════════
// SECTION 3 — COLOR SETTINGS HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Return the active color palette.
 * get_option( $key, $default ) reads from the WordPress database.
 * If an admin hasn't saved a value yet, the default brand color is returned.
 */
function lce_get_colors() {
    return [
        'teal'    => get_option( 'lce_color_teal',    '#066D7E' ),
        'black'   => get_option( 'lce_color_black',   '#000000' ),
        'white'   => get_option( 'lce_color_white',   '#ffffff' ),
        'bg'      => get_option( 'lce_color_bg',      '#F2F2F2' ),
        'divider' => get_option( 'lce_color_divider', '#E6E6E6' ),
    ];
}


// ══════════════════════════════════════════════════════════════
// SECTION 4 — ADMIN SETTINGS PAGE
// Adds a settings page under WordPress Admin → Settings menu.
// ══════════════════════════════════════════════════════════════

/**
 * Register the settings page in the WordPress admin menu.
 */
function lce_admin_menu() {
    add_options_page(
        'Limitless Cost Estimator Settings', // Page <title>
        'Limitless Estimator',               // Menu label
        'manage_options',                    // Required capability (admins only)
        'limitless-cost-estimator',          // Menu slug (URL)
        'lce_render_settings_page'           // Callback that outputs the page HTML
    );
}
add_action( 'admin_menu', 'lce_admin_menu' );


/**
 * Output the HTML for the Settings page and handle form saves.
 */
function lce_render_settings_page() {

    // Only admins should reach this page, but double-check.
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }

    // ── Handle form submission ────────────────────────────────
    // check_admin_referer() verifies the hidden nonce field to
    // prevent Cross-Site Request Forgery (CSRF) attacks.
    if ( isset( $_POST['lce_save_colors'] ) && check_admin_referer( 'lce_save_colors_nonce' ) ) {

        $fields = [ 'lce_color_teal', 'lce_color_black', 'lce_color_white', 'lce_color_bg', 'lce_color_divider' ];

        foreach ( $fields as $field ) {
            if ( isset( $_POST[ $field ] ) ) {
                // sanitize_hex_color() ensures the value is a valid #RRGGBB or #RGB color.
                update_option( $field, sanitize_hex_color( wp_unslash( $_POST[ $field ] ) ) );
            }
        }

        echo '<div class="notice notice-success is-dismissible"><p><strong>Colors saved!</strong> Visit your page to see the changes.</p></div>';
    }

    $c = lce_get_colors();

    ?>
    <div class="wrap">
        <h1>&#127881; Limitless Cost Estimator — Settings</h1>
        <p>Adjust the calculator's color palette here. Changes take effect immediately on the front end.</p>

        <form method="post" action="">
            <?php
            // wp_nonce_field() outputs a hidden input with a security token.
            wp_nonce_field( 'lce_save_colors_nonce' );
            ?>

            <table class="form-table" role="presentation">
                <tbody>
                    <tr>
                        <th scope="row">
                            <label for="lce_color_teal">Primary / Teal Color</label>
                        </th>
                        <td>
                            <input
                                type="color"
                                name="lce_color_teal"
                                id="lce_color_teal"
                                value="<?php echo esc_attr( $c['teal'] ); ?>"
                            >
                            <p class="description">Used for headings, badges, the Add button, and tier highlights. Default: #066D7E</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="lce_color_black">Text / Black Color</label>
                        </th>
                        <td>
                            <input
                                type="color"
                                name="lce_color_black"
                                id="lce_color_black"
                                value="<?php echo esc_attr( $c['black'] ); ?>"
                            >
                            <p class="description">Main body text color. Default: #000000</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="lce_color_white">Card Background Color</label>
                        </th>
                        <td>
                            <input
                                type="color"
                                name="lce_color_white"
                                id="lce_color_white"
                                value="<?php echo esc_attr( $c['white'] ); ?>"
                            >
                            <p class="description">Background color for all white cards. Default: #ffffff</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="lce_color_bg">Page Background Color</label>
                        </th>
                        <td>
                            <input
                                type="color"
                                name="lce_color_bg"
                                id="lce_color_bg"
                                value="<?php echo esc_attr( $c['bg'] ); ?>"
                            >
                            <p class="description">Light gray area behind the cards. Default: #F2F2F2</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="lce_color_divider">Divider / Border Color</label>
                        </th>
                        <td>
                            <input
                                type="color"
                                name="lce_color_divider"
                                id="lce_color_divider"
                                value="<?php echo esc_attr( $c['divider'] ); ?>"
                            >
                            <p class="description">Horizontal lines between rows and sections. Default: #E6E6E6</p>
                        </td>
                    </tr>
                </tbody>
            </table>

            <p class="submit">
                <input
                    type="submit"
                    name="lce_save_colors"
                    class="button button-primary"
                    value="Save Colors"
                >
            </p>

        </form>

        <hr>
        <h2>How to use</h2>
        <p>Paste this shortcode into any page or post:</p>
        <code style="font-size:16px; padding:8px 12px; background:#f0f0f0; display:inline-block; border-radius:4px;">[limitless_cost_estimator]</code>

    </div>
    <?php
}
