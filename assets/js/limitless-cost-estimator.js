/**
 * Limitless Cost Estimator — Main JavaScript
 *
 * Responsibilities:
 *  1. Render design rows on page load (starts with one blank row).
 *  2. Let users add / remove / edit design rows.
 *  3. Recalculate everything live whenever any value changes.
 *  4. Render the pricing tier table and highlight the active tier.
 *
 * No external libraries — pure vanilla JavaScript.
 * The entire file is wrapped in an IIFE (Immediately Invoked Function
 * Expression) to keep all variables private and avoid conflicts
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

    /** Gap between each design (horizontal AND vertical), in inches. */
    var GAP = 0.25;

    /**
     * Minimum billable linear inches.
     * Even if the calculated total is only 3", the customer is billed for 12".
     */
    var MIN_BILLABLE_LI = 12;

    /**
     * Free shipping threshold in dollars.
     * Orders at or above this amount qualify for free shipping.
     */
    var FREE_SHIPPING_THRESHOLD = 50.00;

    /**
     * Pricing tiers — min/max are total billable linear-inch thresholds (inclusive).
     * price is dollars per linear inch.
     */
    var PRICING_TIERS = [
        { min: 12,    max: 23,       price: 0.99, label: '12\u2033\u201323\u2033'        },
        { min: 24,    max: 35,       price: 0.88, label: '24\u2033\u201335\u2033'        },
        { min: 36,    max: 47,       price: 0.84, label: '36\u2033\u201347\u2033'        },
        { min: 48,    max: 59,       price: 0.77, label: '48\u2033\u201359\u2033'        },
        { min: 60,    max: 71,       price: 0.70, label: '60\u2033\u201371\u2033'        },
        { min: 72,    max: 99,       price: 0.66, label: '72\u2033\u201399\u2033'        },
        { min: 100,   max: 199,      price: 0.61, label: '100\u2033\u2013199\u2033'      },
        { min: 200,   max: 299,      price: 0.57, label: '200\u2033\u2013299\u2033'      },
        { min: 300,   max: 999,      price: 0.55, label: '300\u2033\u2013999\u2033'      },
        { min: 1000,  max: 1999,     price: 0.53, label: '1,000\u2033\u20131,999\u2033'  },
        { min: 2000,  max: 4999,     price: 0.52, label: '2,000\u2033\u20134,999\u2033'  },
        { min: 5000,  max: Infinity, price: 0.50, label: '5,000\u2033+'                  },
    ];

    /**
     * Page starts with one blank row — no preloaded values.
     * Width, height, and qty are empty strings so the inputs render blank.
     */
    var DEFAULT_DESIGNS = [
        { width: '', height: '', qty: '' },
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

       *** DO NOT change this section without updating the version. ***
       ══════════════════════════════════════════════════════════ */

    /**
     * Calculate the raw linear inches for ONE orientation of a design.
     *
     * @param {number} w    - Width placed across the roll (inches)
     * @param {number} h    - Height placed down the roll / along its length (inches)
     * @param {number} qty  - Number of copies needed
     * @returns {number}    - Raw float linear inches, or Infinity if the design
     *                        is too wide to fit on the roll in this orientation.
     *
     * HOW IT WORKS:
     *   cols  = how many designs fit side-by-side across the 22.5" roll,
     *           INCLUDING the 0.25" horizontal gap between each design.
     *           n designs need  n×w + (n−1)×0.25  inches of width.
     *           Solving for n:  n ≤ (ROLL_WIDTH + GAP) / (w + GAP)
     *           So:  cols = floor( 22.75 / (w + 0.25) )
     *
     *   rows  = how many row-bands are stacked down the roll's length.
     *           Math.ceil ensures every copy fits even if the last row is partial.
     *
     *   rawLinearInches = rows × (h + GAP)
     *           Each row occupies (height + 0.25") of film.
     *           Returned as a raw float — rounding happens at the total level.
     */
    function calcForOrientation(w, h, qty) {
        var cols = Math.floor((ROLL_WIDTH + GAP) / (w + GAP));

        if (cols < 1) {
            return Infinity; // design wider than the roll in this orientation
        }

        var rows             = Math.ceil(qty / cols);
        var rawLinearInches  = rows * (h + GAP);

        return rawLinearInches;
    }

    /**
     * Calculate raw linear inches for a design, auto-rotating 90° if that
     * produces a shorter result.
     *
     * @param {number} width
     * @param {number} height
     * @param {number} qty
     * @returns {number} Minimum raw linear inches across both orientations.
     */
    function calcDesignLinearInches(width, height, qty) {
        var liNormal  = calcForOrientation(width,  height, qty); // as entered
        var liRotated = calcForOrientation(height, width,  qty); // rotated 90°
        return Math.min(liNormal, liRotated);
    }

    /**
     * Look up the pricing tier for a given billable linear-inch value.
     *
     * @param {number} billableLI
     * @returns {object|null}
     */
    function getPricingTier(billableLI) {
        for (var i = 0; i < PRICING_TIERS.length; i++) {
            var tier = PRICING_TIERS[i];
            if (billableLI >= tier.min && billableLI <= tier.max) {
                return tier;
            }
        }
        return null;
    }

    /**
     * Format a number as a dollar amount string: "$X.XX"
     * Uses Math.round to avoid floating-point drift (e.g. 0.1 + 0.2 = 0.30000004).
     *
     * @param {number} value
     * @returns {string}
     */
    function formatMoney(value) {
        return '$' + (Math.round(value * 100) / 100).toFixed(2);
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 4 — DOM HELPERS
       ══════════════════════════════════════════════════════════ */

    /** querySelector scoped to a context element (or document by default). */
    function qs(selector, context) {
        return (context || document).querySelector(selector);
    }

    /** Create an HTML element, optionally set its innerHTML, and return it. */
    function el(tag, html) {
        var node = document.createElement(tag);
        if (html !== undefined) { node.innerHTML = html; }
        return node;
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 5 — BUILD THE PRICING TIER TABLE
       Called once on init. Reads PRICING_TIERS and fills #lce-tier-list.
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
     *
     * @param {object} design - { id, width, height, qty }
     *                          width/height/qty may be '' (blank) on a new row.
     * @param {number} index  - 0-based position (used for the badge number)
     * @returns {HTMLElement}
     */
    function buildDesignRow(design, index) {
        var row         = el('div');
        row.className   = 'lce-design-row';
        row.dataset.id  = design.id;

        // value="" renders a blank input; value="11" renders with the number.
        // Both are handled correctly — blank inputs just won't contribute to calcs.
        row.innerHTML =
            '<span class="lce-row-num">' + (index + 1) + '</span>'

          + '<div class="lce-input-wrap">'
          +   '<input class="lce-input lce-width-input"'
          +          ' type="number" value="' + design.width + '"'
          +          ' min="0.01" step="0.01" inputmode="decimal"'
          +          ' placeholder="0.00"'
          +          ' aria-label="Width in inches">'
          +   '<span class="lce-input-unit">in</span>'
          + '</div>'

          + '<div class="lce-input-wrap">'
          +   '<input class="lce-input lce-height-input"'
          +          ' type="number" value="' + design.height + '"'
          +          ' min="0.01" step="0.01" inputmode="decimal"'
          +          ' placeholder="0.00"'
          +          ' aria-label="Height in inches">'
          +   '<span class="lce-input-unit">in</span>'
          + '</div>'

          + '<div class="lce-qty-wrap">'
          +   '<input class="lce-qty-input"'
          +          ' type="number" value="' + design.qty + '"'
          +          ' min="1" step="1" inputmode="numeric"'
          +          ' placeholder="0"'
          +          ' aria-label="Quantity">'
          +   '<div class="lce-qty-arrows">'
          +     '<button class="lce-qty-btn lce-qty-up"   type="button" aria-label="Increase quantity">&#9650;</button>'
          +     '<button class="lce-qty-btn lce-qty-down" type="button" aria-label="Decrease quantity">&#9660;</button>'
          +   '</div>'
          + '</div>'

          + '<span class="lce-li-display" aria-live="polite">\u2014</span>'
          + '<span class="lce-cost-badge">\u2014</span>'

          + '<button class="lce-delete-btn" type="button" aria-label="Remove design ' + (index + 1) + '">'
          +   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"'
          +        ' stroke="currentColor" stroke-width="2"'
          +        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
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
     * Always followed by updateAll() to recalculate displayed values.
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

       Variable naming used throughout this function:
         rawLinearInches     — float result from calcDesignLinearInches()
         roundedLinearInches — Math.ceil(rawLinearInches) per design
         totalRoundedLI      — sum of roundedLinearInches for all valid rows
         billableLinearInches — max(MIN_BILLABLE_LI, totalRoundedLI)
                                This is what the customer is charged for.
       ══════════════════════════════════════════════════════════ */

    function updateAll() {

        var domRows    = document.querySelectorAll('#lce-design-rows .lce-design-row');
        var rowResults = []; // stores per-row calc results for use in display pass

        /* ── Pass 1: Read inputs and calculate per-row linear inches ── */
        domRows.forEach(function (row) {
            var widthInput  = qs('.lce-width-input',  row);
            var heightInput = qs('.lce-height-input', row);
            var qtyInput    = qs('.lce-qty-input',    row);
            var allWraps    = row.querySelectorAll('.lce-input-wrap');
            var qtyWrap     = qs('.lce-qty-wrap', row);

            var width  = parseFloat(widthInput.value)  || 0;
            var height = parseFloat(heightInput.value) || 0;
            var qty    = parseInt(qtyInput.value, 10)  || 0;

            var isValid = width > 0 && height > 0 && qty > 0;

            // Only show a red border if the user typed something invalid,
            // not on blank fields (blank = row not yet filled in, which is fine).
            var widthBlank  = widthInput.value.trim()  === '';
            var heightBlank = heightInput.value.trim() === '';
            var qtyBlank    = qtyInput.value.trim()    === '';

            toggleError(allWraps[0], !widthBlank  && width  <= 0);
            toggleError(allWraps[1], !heightBlank && height <= 0);
            toggleError(qtyWrap,     !qtyBlank    && qty    <= 0);

            // Only calculate for rows where all three fields have valid values.
            var rawLinearInches     = 0;
            var roundedLinearInches = 0;

            if (isValid) {
                rawLinearInches     = calcDesignLinearInches(width, height, qty);
                roundedLinearInches = Math.ceil(rawLinearInches);
            }

            rowResults.push({
                isValid:             isValid,
                rawLinearInches:     rawLinearInches,
                roundedLinearInches: roundedLinearInches,
                qty:                 qty,
            });
        });

        /* ── Sum rounded LI across all valid rows ── */
        var totalRoundedLI = 0;
        var validRowCount  = 0;

        rowResults.forEach(function (r) {
            if (r.isValid) {
                totalRoundedLI += r.roundedLinearInches;
                validRowCount++;
            }
        });

        /* ── Apply 12" minimum to get the billable total ──
         *
         * Regardless of how many designs or how small they are, the customer
         * is always billed for at least MIN_BILLABLE_LI (12") of film.
         *
         *   totalRoundedLI = 0   → no valid rows yet     → billable = 0
         *   totalRoundedLI = 5   → under 12"             → billable = 12
         *   totalRoundedLI = 40  → at or above 12"       → billable = 40
         */
        var billableLinearInches = 0;
        if (totalRoundedLI > 0) {
            billableLinearInches = Math.max(MIN_BILLABLE_LI, totalRoundedLI);
        }

        /* ── Tier and total cost are both based on billableLinearInches ── */
        var tier       = getPricingTier(billableLinearInches);
        var pricePerIn = tier ? tier.price : 0;
        var totalCost  = billableLinearInches * pricePerIn;

        /* ── Pass 2: Write per-row display values ── */
        domRows.forEach(function (row, i) {
            var result    = rowResults[i];
            var liDisplay = qs('.lce-li-display', row);
            var costBadge = qs('.lce-cost-badge',  row);

            if (!result.isValid) {
                // Row is blank or incomplete — show dashes, no error badge
                liDisplay.textContent = '\u2014';
                costBadge.textContent = '\u2014';
                costBadge.classList.remove('is-active');
                return;
            }

            /* Linear inches display for this row:
             *   - Normally: show the row's own roundedLinearInches.
             *   - Special case: if this is the ONLY valid row and its total
             *     is under the 12" minimum, show 12" so the customer sees
             *     exactly what they'll be billed for (not the raw 5" or 8").
             */
            var displayLI = result.roundedLinearInches;
            if (validRowCount === 1 && totalRoundedLI < MIN_BILLABLE_LI) {
                displayLI = MIN_BILLABLE_LI;
            }
            liDisplay.textContent = displayLI + ' in';

            /* Cost per transfer:
             *   Each design pays its proportional share of the total billable cost.
             *   Formula: (thisRow_roundedLI / totalRoundedLI) × totalCost ÷ qty
             *
             *   When there is only one valid row:
             *     proportion = 100%, so this simplifies to: totalCost / qty
             *
             *   When there are multiple valid rows:
             *     each row pays for its fair share of the billable total.
             *
             *   Example (single row, 4"×4", qty 2):
             *     roundedLI = 5, totalRounded = 5, billable = 12
             *     totalCost = 12 × $0.99 = $11.88
             *     costPerTransfer = (5/5) × $11.88 / 2 = $5.94
             */
            var costPerTransfer = (result.roundedLinearInches / totalRoundedLI)
                                  * totalCost
                                  / result.qty;

            costBadge.textContent = formatMoney(costPerTransfer);
            costBadge.classList.add('is-active');
        });

        /* ── Update the Estimate Summary card ── */
        var totalLIEl    = qs('#lce-total-li');
        var pricePerInEl = qs('#lce-price-per-in');
        var tierBadgeEl  = qs('#lce-tier-badge');
        var totalCostEl  = qs('#lce-total-cost');

        if (billableLinearInches > 0) {
            totalLIEl.textContent = billableLinearInches + ' in';
        } else {
            totalLIEl.textContent = '0 in';
        }

        if (tier) {
            pricePerInEl.textContent  = '$' + tier.price.toFixed(2);
            tierBadgeEl.textContent   = tier.label;
            tierBadgeEl.style.display = 'inline-flex';
        } else {
            pricePerInEl.textContent  = '$0.00';
            tierBadgeEl.textContent   = '';
            tierBadgeEl.style.display = 'none';
        }

        totalCostEl.textContent = billableLinearInches > 0
            ? formatMoney(totalCost)
            : '$0.00';

        /* ── Highlight the active tier row in the pricing table ── */
        document.querySelectorAll('#lce-tier-list .lce-tier-item').forEach(function (item) {
            item.classList.remove('is-active');
        });

        if (tier) {
            var activeItem = qs('#lce-tier-list .lce-tier-item[data-min="' + tier.min + '"]');
            if (activeItem) { activeItem.classList.add('is-active'); }
        }

        /* ── Free shipping area ──────────────────────────────────────────
         *
         * Three states based on totalCost:
         *
         *   0 (no valid rows)  → hide the whole area
         *   > 0 and < $50      → show "+ Shipping" + "Add $X.XX more..." note
         *   >= $50             → show "QUALIFIES FOR FREE SHIPPING!" pill
         *
         * No calculation logic here — only display toggling.
         * ────────────────────────────────────────────────────────────── */
        var shippingArea  = qs('#lce-shipping-area');
        var shippingPlus  = qs('#lce-shipping-plus');
        var shippingNote  = qs('#lce-shipping-note');
        var freeBadge     = qs('#lce-free-badge');

        if (!shippingArea) { return; } // safety check — elements must exist

        if (billableLinearInches <= 0 || totalCost <= 0) {
            // State 1: no valid inputs — hide everything
            shippingArea.style.display = 'none';

        } else if (totalCost >= FREE_SHIPPING_THRESHOLD) {
            // State 3: qualifies for free shipping
            shippingArea.style.display  = 'block';
            shippingPlus.style.display  = 'none';
            shippingNote.style.display  = 'none';
            freeBadge.style.display     = 'block';

        } else {
            // State 2: under $50 — show "+ Shipping" and the "add more" note
            var amountNeeded = FREE_SHIPPING_THRESHOLD - totalCost;

            shippingArea.style.display  = 'block';
            shippingPlus.style.display  = 'block';
            shippingNote.style.display  = 'block';
            freeBadge.style.display     = 'none';

            // The dollar amount is wrapped in <strong><em> so it renders in
            // italic bold, matching the style in the reference image.
            shippingNote.innerHTML = 'Add <strong><em>'
                + formatMoney(amountNeeded)
                + '</em></strong> more to qualify for free shipping';
        }
    }

    /**
     * Toggle the red 'has-error' border class on an input wrapper.
     * @param {HTMLElement} wrapper
     * @param {boolean}     isError
     */
    function toggleError(wrapper, isError) {
        if (!wrapper) { return; }
        wrapper.classList.toggle('has-error', isError);
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 8 — EVENT HANDLERS
       ══════════════════════════════════════════════════════════ */

    /** Add a new blank design row. */
    function handleAddDesign() {
        // New rows start blank, matching the initial page state.
        designs.push({ id: nextId++, width: '', height: '', qty: '' });
        renderDesignRows();
        updateAll();

        // Scroll the new row into view
        var rows = document.querySelectorAll('#lce-design-rows .lce-design-row');
        if (rows.length > 0) {
            rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /**
     * Remove a design row. Keeps at least one row so the calculator is never empty.
     * @param {HTMLElement} rowEl
     */
    function handleDeleteDesign(rowEl) {
        if (designs.length <= 1) { return; }

        var id = parseInt(rowEl.dataset.id, 10);
        designs = designs.filter(function (d) { return d.id !== id; });

        renderDesignRows();
        updateAll();
    }

    /**
     * Step the quantity up or down by delta (+1 or -1).
     * If the field is currently blank, stepping up starts at 1.
     * @param {HTMLElement} rowEl
     * @param {number}      delta
     */
    function handleQtyStep(rowEl, delta) {
        var input = qs('.lce-qty-input', rowEl);
        var val   = parseInt(input.value, 10) || 0; // treat blank as 0
        input.value = Math.max(1, val + delta);
        updateAll();
    }

    /**
     * Called on every keystroke in width, height, or qty inputs.
     * Allows blank fields (= incomplete row, excluded from calculations).
     * Rejects values that are entered but invalid (e.g. "-5" or "0").
     * @param {HTMLInputElement} input
     */
    function handleInputChange(input) {
        var raw = input.value.trim();

        if (raw === '') {
            // Blank is allowed — the row just won't be included in calculations.
            updateAll();
            return;
        }

        if (input.classList.contains('lce-qty-input')) {
            var intVal = parseInt(raw, 10);
            if (isNaN(intVal) || intVal < 1) { input.value = 1; }
        } else {
            // Width or height
            var floatVal = parseFloat(raw);
            if (isNaN(floatVal) || floatVal <= 0) { input.value = ''; }
        }

        updateAll();
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 9 — INITIALISATION
       Wire everything up when the page is ready.
       ══════════════════════════════════════════════════════════ */

    function init() {

        var calculator = qs('#lce-calculator');
        if (!calculator) { return; }

        // Build the initial UI — one blank row + tier table
        renderDesignRows();
        renderPricingTiers();
        updateAll();

        // ── Add Another Design button ──
        var addBtn = qs('#lce-add-design');
        if (addBtn) {
            addBtn.addEventListener('click', handleAddDesign);
        }

        var rowsContainer = qs('#lce-design-rows');
        if (!rowsContainer) { return; }

        /*
         * Event delegation: one listener on the container catches events
         * from all rows, including rows added dynamically after page load.
         */

        // Live recalculation on every keystroke
        rowsContainer.addEventListener('input', function (e) {
            var target = e.target;
            if (
                target.classList.contains('lce-input') ||
                target.classList.contains('lce-qty-input')
            ) {
                handleInputChange(target);
            }
        });

        // Button clicks: delete row, qty up/down arrows
        rowsContainer.addEventListener('click', function (e) {
            var row = e.target.closest('.lce-design-row');
            if (!row) { return; }

            if      (e.target.closest('.lce-delete-btn')) { handleDeleteDesign(row);    }
            else if (e.target.closest('.lce-qty-up'))     { handleQtyStep(row,  1);     }
            else if (e.target.closest('.lce-qty-down'))   { handleQtyStep(row, -1);     }
        });

        // On blur: clean up any invalid but non-blank value, then sync state
        rowsContainer.addEventListener('blur', function (e) {
            var target = e.target;
            var raw    = target.value.trim();

            if (target.classList.contains('lce-input')) {
                if (raw !== '') {
                    var val = parseFloat(raw);
                    if (isNaN(val) || val <= 0) {
                        target.value = ''; // clear the bad value
                    }
                }
                syncStateFromDOM();
                updateAll();
            }

            if (target.classList.contains('lce-qty-input')) {
                if (raw !== '') {
                    var qty = parseInt(raw, 10);
                    if (isNaN(qty) || qty < 1) {
                        target.value = ''; // clear the bad value
                    }
                }
                syncStateFromDOM();
                updateAll();
            }

        }, true /* capture phase so blur bubbles from child inputs */);
    }

    /**
     * Walk every design row in the DOM and sync input values back into
     * the `designs` state array. Keeps state consistent with what's displayed,
     * which is useful if we ever need to read state outside of updateAll()
     * (e.g. a future "save quote" feature).
     */
    function syncStateFromDOM() {
        var rows = document.querySelectorAll('#lce-design-rows .lce-design-row');

        rows.forEach(function (row) {
            var id     = parseInt(row.dataset.id, 10);
            var design = designs.find(function (d) { return d.id === id; });
            if (!design) { return; }

            var wStr = qs('.lce-width-input',  row).value.trim();
            var hStr = qs('.lce-height-input', row).value.trim();
            var qStr = qs('.lce-qty-input',    row).value.trim();

            var w = parseFloat(wStr);
            var h = parseFloat(hStr);
            var q = parseInt(qStr, 10);

            // Store the value if valid; otherwise store '' (blank)
            design.width  = (w > 0)  ? w  : '';
            design.height = (h > 0)  ? h  : '';
            design.qty    = (q >= 1) ? q  : '';
        });
    }

    /* ── Kick things off ── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init(); // DOM already ready (script loaded in footer)
    }

})(); // End of IIFE
