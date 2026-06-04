/**
 * Limitless Cost Estimator — Main JavaScript
 *
 * Responsibilities:
 *  1. Render the default design rows on page load.
 *  2. Let users add / remove / edit design rows.
 *  3. Recalculate everything live whenever any value changes.
 *  4. Render the pricing tier table and highlight the active tier.
 *
 * No external libraries are used — pure vanilla JavaScript.
 * The entire file is wrapped in an IIFE (Immediately Invoked Function
 * Expression) to keep all our variables private and avoid conflicts
 * with the theme or other plugins.
 */

(function () {
    'use strict';

    /* ══════════════════════════════════════════════════════════
       SECTION 1 — CONSTANTS
       These values never change while the plugin is running.
       ══════════════════════════════════════════════════════════ */

    /** Width of the printable DTF roll in inches. */
    var ROLL_WIDTH = 22.5;

    /** Gap added between (and after) each design row, in inches.
        Each row on the gang sheet occupies (height + GAP) inches of film. */
    var GAP = 0.25;

    /**
     * Pricing tiers.
     * min/max are total linear-inch thresholds (inclusive).
     * price is dollars per linear inch.
     */
    var PRICING_TIERS = [
        { min: 12,    max: 23,         price: 0.99, label: '12\u2033\u201323\u2033'       },
        { min: 24,    max: 35,         price: 0.88, label: '24\u2033\u201335\u2033'       },
        { min: 36,    max: 47,         price: 0.84, label: '36\u2033\u201347\u2033'       },
        { min: 48,    max: 59,         price: 0.77, label: '48\u2033\u201359\u2033'       },
        { min: 60,    max: 71,         price: 0.70, label: '60\u2033\u201371\u2033'       },
        { min: 72,    max: 99,         price: 0.66, label: '72\u2033\u201399\u2033'       },
        { min: 100,   max: 199,        price: 0.61, label: '100\u2033\u2013199\u2033'     },
        { min: 200,   max: 299,        price: 0.57, label: '200\u2033\u2013299\u2033'     },
        { min: 300,   max: 999,        price: 0.55, label: '300\u2033\u2013999\u2033'     },
        { min: 1000,  max: 1999,       price: 0.53, label: '1,000\u2033\u20131,999\u2033' },
        { min: 2000,  max: 4999,       price: 0.52, label: '2,000\u2033\u20134,999\u2033' },
        { min: 5000,  max: Infinity,   price: 0.50, label: '5,000\u2033+'                 },
    ];

    /**
     * Default designs shown on first load (matching the mockup).
     * Each object has: width, height, qty.
     */
    var DEFAULT_DESIGNS = [
        { width: 11, height: 8,  qty: 25 },
        { width: 6,  height: 6,  qty: 50 },
        { width: 10, height: 12, qty: 15 },
    ];


    /* ══════════════════════════════════════════════════════════
       SECTION 2 — STATE
       A simple array holds every design row.
       Each entry gets a unique `id` so we can find and delete rows.
       ══════════════════════════════════════════════════════════ */

    /** Our working copy of all designs. */
    var designs = DEFAULT_DESIGNS.map(function (d, i) {
        return { id: i + 1, width: d.width, height: d.height, qty: d.qty };
    });

    /** Counter used to assign unique IDs to new rows. */
    var nextId = DEFAULT_DESIGNS.length + 1;


    /* ══════════════════════════════════════════════════════════
       SECTION 3 — CALCULATION ENGINE
       Pure functions — they take numbers in, return numbers out.
       No DOM interaction here, making them easy to test or tweak.
       ══════════════════════════════════════════════════════════ */

    /**
     * Calculate the linear inches for ONE orientation of a design.
     *
     * @param {number} w    - Width placed across the roll (inches)
     * @param {number} h    - Height placed down the roll / along its length (inches)
     * @param {number} qty  - Number of copies needed
     * @returns {number}    - Linear inches, floored to nearest whole inch,
     *                        or Infinity if the design is too wide to fit.
     *
     * HOW IT WORKS:
     *   cols  = how many designs fit side-by-side across the 22.5" roll,
     *           INCLUDING the 0.25" horizontal gap between each design.
     *           Formula: n designs need  n×w + (n−1)×GAP  inches of width.
     *           Solving for n:  n ≤ (ROLL_WIDTH + GAP) / (w + GAP)
     *           So:  cols = floor( (22.5 + 0.25) / (w + 0.25) )
     *                     = floor( 22.75 / (w + 0.25) )
     *
     *   rows  = how many row-bands are stacked down the roll's length.
     *           Uses Math.ceil so every copy fits even if the last row is partial.
     *
     *   li    = rows × (h + GAP)
     *           Each row occupies (design height + 0.25" gap) inches of film.
     *           Returned as a raw float — the TOTAL is ceiled, not each row.
     */
    function calcForOrientation(w, h, qty) {
        // Account for 0.25" gaps between designs horizontally
        var cols = Math.floor((ROLL_WIDTH + GAP) / (w + GAP));

        if (cols < 1) {
            // Design is wider than the roll — cannot fit in this orientation.
            return Infinity;
        }

        var rows = Math.ceil(qty / cols);
        var li   = rows * (h + GAP); // raw float — total is ceiled later

        return li;
    }

    /**
     * Calculate linear inches for a design, automatically rotating it
     * 90° if that results in fewer linear inches (i.e., a shorter roll).
     *
     * @param {number} width
     * @param {number} height
     * @param {number} qty
     * @returns {number} Minimum linear inches across both orientations.
     */
    function calcDesignLinearInches(width, height, qty) {
        var liNormal  = calcForOrientation(width,  height, qty); // as entered
        var liRotated = calcForOrientation(height, width,  qty); // rotated 90°
        return Math.min(liNormal, liRotated);
    }

    /**
     * Look up the correct pricing tier for a given total linear-inch value.
     *
     * @param {number} totalLI
     * @returns {object|null} The matching tier object, or null if below the minimum.
     */
    function getPricingTier(totalLI) {
        for (var i = 0; i < PRICING_TIERS.length; i++) {
            var tier = PRICING_TIERS[i];
            if (totalLI >= tier.min && totalLI <= tier.max) {
                return tier;
            }
        }
        return null;
    }

    /**
     * Format a number as a dollar amount: $X.XX
     * Uses Math.round to avoid floating-point weirdness (e.g., 0.1 + 0.2 = 0.30000004).
     *
     * @param {number} value
     * @returns {string}
     */
    function formatMoney(value) {
        return '$' + (Math.round(value * 100) / 100).toFixed(2);
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 4 — DOM HELPERS
       Tiny shortcuts so we don't repeat document.querySelector
       everywhere in the code.
       ══════════════════════════════════════════════════════════ */

    /**
     * querySelector scoped to a context element (or document by default).
     * Returns the first matching element or null.
     */
    function qs(selector, context) {
        return (context || document).querySelector(selector);
    }

    /**
     * Create an element, optionally set its innerHTML, and return it.
     * (Just a convenience wrapper.)
     */
    function el(tag, html) {
        var node = document.createElement(tag);
        if (html !== undefined) { node.innerHTML = html; }
        return node;
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 5 — BUILD THE PRICING TIER TABLE
       Called once on init. Reads from PRICING_TIERS and fills
       the #lce-tier-list container.
       ══════════════════════════════════════════════════════════ */

    function renderPricingTiers() {
        var container = qs('#lce-tier-list');
        if (!container) { return; }

        var html = '';
        PRICING_TIERS.forEach(function (tier) {
            html += '<div class="lce-tier-item" data-min="' + tier.min + '">'
                  +   '<span class="lce-tier-range">' + tier.label + '</span>'
                  +   '<span class="lce-tier-price">$' + tier.price.toFixed(2) + '/IN</span>'
                  + '</div>';
        });

        container.innerHTML = html;
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 6 — BUILD / REBUILD DESIGN ROWS
       Called on init and whenever a row is added or removed.
       ══════════════════════════════════════════════════════════ */

    /**
     * Build the HTML for a single design row.
     * Using innerHTML here keeps things readable and avoids
     * creating 15+ individual elements with createElement.
     *
     * @param {object} design - { id, width, height, qty }
     * @param {number} index  - 0-based position in the list (used for the badge number)
     * @returns {HTMLElement}
     */
    function buildDesignRow(design, index) {
        var row = el('div');
        row.className    = 'lce-design-row';
        row.dataset.id   = design.id;

        row.innerHTML =
            /* Row number badge */
            '<span class="lce-row-num">' + (index + 1) + '</span>'

            /* Width input */
          + '<div class="lce-input-wrap">'
          +   '<input class="lce-input lce-width-input"'
          +          ' type="number" value="' + design.width + '"'
          +          ' min="0.01" step="0.01" inputmode="decimal"'
          +          ' aria-label="Width in inches">'
          +   '<span class="lce-input-unit">in</span>'
          + '</div>'

            /* Height input */
          + '<div class="lce-input-wrap">'
          +   '<input class="lce-input lce-height-input"'
          +          ' type="number" value="' + design.height + '"'
          +          ' min="0.01" step="0.01" inputmode="decimal"'
          +          ' aria-label="Height in inches">'
          +   '<span class="lce-input-unit">in</span>'
          + '</div>'

            /* Quantity stepper */
          + '<div class="lce-qty-wrap">'
          +   '<input class="lce-qty-input"'
          +          ' type="number" value="' + design.qty + '"'
          +          ' min="1" step="1" inputmode="numeric"'
          +          ' aria-label="Quantity">'
          +   '<div class="lce-qty-arrows">'
          +     '<button class="lce-qty-btn lce-qty-up" type="button" aria-label="Increase quantity">&#9650;</button>'
          +     '<button class="lce-qty-btn lce-qty-down" type="button" aria-label="Decrease quantity">&#9660;</button>'
          +   '</div>'
          + '</div>'

            /* Linear inches (read-only, updated by JS) */
          + '<span class="lce-li-display" aria-live="polite">\u2014</span>'

            /* Cost per transfer badge (read-only, updated by JS) */
          + '<span class="lce-cost-badge">\u2014</span>'

            /* Delete button */
          + '<button class="lce-delete-btn" type="button" aria-label="Remove design ' + (index + 1) + '">'
          +   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"'
          +        ' stroke="currentColor" stroke-width="2"'
          +        ' stroke-linecap="round" stroke-linejoin="round"'
          +        ' aria-hidden="true">'
          +     '<polyline points="3 6 5 6 21 6"></polyline>'
          +     '<path d="M19 6l-1 14H6L5 6"></path>'
          +     '<path d="M10 11v6M14 11v6"></path>'
          +     '<path d="M9 6V4h6v2"></path>'
          +   '</svg>'
          + '</button>';

        return row;
    }

    /**
     * Wipe and re-render all design rows from the `designs` array.
     * After calling this we always call updateAll() to fill in the numbers.
     */
    function renderDesignRows() {
        var container = qs('#lce-design-rows');
        if (!container) { return; }

        container.innerHTML = '';

        designs.forEach(function (design, index) {
            container.appendChild(buildDesignRow(design, index));
        });
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 7 — MAIN CALCULATION + DISPLAY UPDATE
       This is called every time any input changes.
       It reads the DOM, calculates everything, then writes results
       back to the DOM in one pass.
       ══════════════════════════════════════════════════════════ */

    function updateAll() {

        /* ── Step 1: Read current values from every design row ── */
        var rows       = document.querySelectorAll('#lce-design-rows .lce-design-row');
        var totalLI    = 0;
        var rowResults = []; // We'll store per-row li here to use in step 3

        rows.forEach(function (row) {
            var widthInput  = qs('.lce-width-input',  row);
            var heightInput = qs('.lce-height-input', row);
            var qtyInput    = qs('.lce-qty-input',    row);
            var widthWrap   = qs('.lce-input-wrap',   row);  // first .lce-input-wrap
            var allWraps    = row.querySelectorAll('.lce-input-wrap');
            var heightWrap  = allWraps[1];
            var qtyWrap     = qs('.lce-qty-wrap',     row);

            var width  = parseFloat(widthInput.value)  || 0;
            var height = parseFloat(heightInput.value) || 0;
            var qty    = parseInt(qtyInput.value, 10)  || 0;

            /* Highlight invalid fields in red */
            toggleError(allWraps[0], width  <= 0);
            toggleError(allWraps[1], height <= 0);
            toggleError(qtyWrap,     qty    <= 0);

            /* Calculate linear inches for this design */
            var li = 0;
            if (width > 0 && height > 0 && qty > 0) {
                li = calcDesignLinearInches(width, height, qty);
            }

            totalLI += li;
            rowResults.push({ li: li, qty: qty });
        });

        /* ── Step 2: Ceil the raw total up to the next whole inch, then look up tier ──
         *
         * totalLI is the raw float sum (e.g. 311.5).
         * billedLI is always a whole number (e.g. 312) — this is what drives
         * the tier lookup, total cost display, and the big "X in" summary number.
         * Fractional inches always round UP, never down, so the customer is never
         * undercharged for film used.
         */
        var billedLI   = totalLI > 0 ? Math.ceil(totalLI) : 0;
        var tier       = getPricingTier(billedLI);
        var pricePerIn = tier ? tier.price : 0;

        /* ── Step 3: Write linear inches and cost-per-transfer back to each row ── */
        rows.forEach(function (row, i) {
            var li  = rowResults[i].li;
            var qty = rowResults[i].qty;

            var liDisplay = qs('.lce-li-display', row);
            var costBadge = qs('.lce-cost-badge',  row);

            if (li > 0) {
                /* Show each design's raw linear inches to 2 decimal places */
                liDisplay.textContent = li.toFixed(2) + ' in';
            } else {
                liDisplay.textContent = '\u2014'; // em dash placeholder
            }

            if (li > 0 && qty > 0 && pricePerIn > 0) {
                /* Cost per transfer uses each design's raw LI at the combined tier rate */
                var costPerTransfer = (li * pricePerIn) / qty;
                costBadge.textContent = formatMoney(costPerTransfer);
                costBadge.classList.add('is-active');
            } else {
                costBadge.textContent = '\u2014';
                costBadge.classList.remove('is-active');
            }
        });

        /* ── Step 4: Update the Estimate Summary card ── */
        var totalLIEl    = qs('#lce-total-li');
        var pricePerInEl = qs('#lce-price-per-in');
        var tierBadgeEl  = qs('#lce-tier-badge');
        var totalCostEl  = qs('#lce-total-cost');

        // Display the ceiled whole-number total (e.g. "312 in")
        totalLIEl.textContent = billedLI > 0 ? billedLI + ' in' : '0 in';

        if (tier) {
            pricePerInEl.textContent  = '$' + tier.price.toFixed(2);
            tierBadgeEl.textContent   = tier.label;
            tierBadgeEl.style.display = 'inline-flex';
        } else {
            pricePerInEl.textContent  = '$0.00';
            tierBadgeEl.textContent   = '';
            tierBadgeEl.style.display = 'none';
        }

        // Total cost is based on the ceiled billed total
        var totalCost = billedLI * pricePerIn;
        totalCostEl.textContent = formatMoney(totalCost);

        /* ── Step 5: Highlight the active tier row in the pricing table ── */
        document.querySelectorAll('#lce-tier-list .lce-tier-item').forEach(function (item) {
            item.classList.remove('is-active');
        });

        if (tier) {
            // data-min is set from PRICING_TIERS[].min — match the active tier
            var activeItem = qs('#lce-tier-list .lce-tier-item[data-min="' + tier.min + '"]');
            if (activeItem) {
                activeItem.classList.add('is-active');
            }
        }
    }

    /**
     * Add or remove the 'has-error' CSS class on an input wrapper.
     * @param {HTMLElement} wrapper
     * @param {boolean}     isError
     */
    function toggleError(wrapper, isError) {
        if (!wrapper) { return; }
        if (isError) {
            wrapper.classList.add('has-error');
        } else {
            wrapper.classList.remove('has-error');
        }
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 8 — EVENT HANDLERS
       ══════════════════════════════════════════════════════════ */

    /** Add a new blank design row. */
    function handleAddDesign() {
        designs.push({ id: nextId++, width: 4, height: 4, qty: 1 });
        renderDesignRows();
        updateAll();

        /* Scroll the new row into view */
        var rows = document.querySelectorAll('#lce-design-rows .lce-design-row');
        if (rows.length > 0) {
            rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /**
     * Remove a design row.
     * We keep at least one row so the calculator is never empty.
     * @param {HTMLElement} rowEl - The .lce-design-row element to remove.
     */
    function handleDeleteDesign(rowEl) {
        if (designs.length <= 1) { return; }

        var id = parseInt(rowEl.dataset.id, 10);
        designs = designs.filter(function (d) { return d.id !== id; });

        renderDesignRows();
        updateAll();
    }

    /**
     * Increment or decrement the quantity for a row.
     * @param {HTMLElement} rowEl
     * @param {number}      delta  - +1 or -1
     */
    function handleQtyStep(rowEl, delta) {
        var input = qs('.lce-qty-input', rowEl);
        var val   = parseInt(input.value, 10) || 1;
        input.value = Math.max(1, val + delta);
        updateAll();
    }

    /**
     * Sanitise an input value on change and trigger a recalculation.
     * Prevents 0, negative numbers, or blank values from being used.
     * @param {HTMLInputElement} input
     */
    function handleInputChange(input) {
        if (input.classList.contains('lce-qty-input')) {
            /* Quantity must be a positive integer */
            var intVal = parseInt(input.value, 10);
            if (isNaN(intVal) || intVal < 1) { input.value = 1; }
        } else {
            /* Width / Height must be a positive decimal */
            var floatVal = parseFloat(input.value);
            if (isNaN(floatVal) || floatVal <= 0) { input.value = ''; }
        }
        updateAll();
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 9 — INITIALISATION
       Wire everything up when the page is ready.
       ══════════════════════════════════════════════════════════ */

    function init() {

        /* Make sure our calculator wrapper exists on this page */
        var calculator = qs('#lce-calculator');
        if (!calculator) { return; }

        /* Build the initial UI */
        renderDesignRows();
        renderPricingTiers();
        updateAll();

        /* ── Button: Add Another Design ── */
        var addBtn = qs('#lce-add-design');
        if (addBtn) {
            addBtn.addEventListener('click', handleAddDesign);
        }

        /*
         * ── Event delegation for design rows ──
         *
         * Instead of attaching listeners to every individual input and button,
         * we attach ONE listener to the rows container and check which element
         * was actually clicked/changed. This is called "event delegation" and
         * is more efficient, especially when rows are added/removed dynamically.
         */
        var rowsContainer = qs('#lce-design-rows');
        if (!rowsContainer) { return; }

        /* Handle text input changes */
        rowsContainer.addEventListener('input', function (e) {
            var target = e.target;
            if (
                target.classList.contains('lce-input') ||
                target.classList.contains('lce-qty-input')
            ) {
                handleInputChange(target);
            }
        });

        /* Handle button clicks (delete, qty up, qty down) */
        rowsContainer.addEventListener('click', function (e) {
            var row = e.target.closest('.lce-design-row');
            if (!row) { return; }

            if (e.target.closest('.lce-delete-btn')) {
                handleDeleteDesign(row);
            } else if (e.target.closest('.lce-qty-up')) {
                handleQtyStep(row, 1);
            } else if (e.target.closest('.lce-qty-down')) {
                handleQtyStep(row, -1);
            }
        });

        /* Enforce positive numbers when user leaves an input (blur) */
        rowsContainer.addEventListener('blur', function (e) {
            var target = e.target;
            if (target.classList.contains('lce-input')) {
                var val = parseFloat(target.value);
                if (isNaN(val) || val <= 0) {
                    /* Restore the last saved value from the designs array */
                    var row    = target.closest('.lce-design-row');
                    var id     = row ? parseInt(row.dataset.id, 10) : null;
                    var design = designs.find(function (d) { return d.id === id; });
                    if (design) {
                        if (target.classList.contains('lce-width-input'))  { target.value = design.width; }
                        if (target.classList.contains('lce-height-input')) { target.value = design.height; }
                    }
                    updateAll();
                }
                /* Keep designs[] in sync with the inputs */
                syncStateFromDOM();
            }
            if (target.classList.contains('lce-qty-input')) {
                var qtyVal = parseInt(target.value, 10);
                if (isNaN(qtyVal) || qtyVal < 1) {
                    target.value = 1;
                    updateAll();
                }
                syncStateFromDOM();
            }
        }, true /* use capture so blur fires on child inputs */);
    }

    /**
     * Walk every design row in the DOM and sync the values back into
     * our `designs` array. This keeps state consistent if we ever need
     * to read it elsewhere (e.g. for a future "save quote" feature).
     */
    function syncStateFromDOM() {
        var rows = document.querySelectorAll('#lce-design-rows .lce-design-row');
        rows.forEach(function (row) {
            var id     = parseInt(row.dataset.id, 10);
            var design = designs.find(function (d) { return d.id === id; });
            if (!design) { return; }

            var w = parseFloat(qs('.lce-width-input',  row).value);
            var h = parseFloat(qs('.lce-height-input', row).value);
            var q = parseInt(qs('.lce-qty-input', row).value, 10);

            if (w > 0)  { design.width  = w; }
            if (h > 0)  { design.height = h; }
            if (q >= 1) { design.qty    = q; }
        });
    }

    /* ── Kick things off ── */
    if (document.readyState === 'loading') {
        /* DOM not ready yet — wait for it */
        document.addEventListener('DOMContentLoaded', init);
    } else {
        /* DOM already ready (e.g. script loaded in footer) */
        init();
    }

})(); // End of IIFE
