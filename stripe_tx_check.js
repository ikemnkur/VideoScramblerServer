const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;


const app = express();
const PORT = process.env.PORT || 5005;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------
// HELPER FUNCTIONS
// ----------------------------

/**
 * Retrieve the latest details of a PaymentIntent from Stripe
 */
async function getPaymentDetails(paymentIntentId) {
    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        return {
            id: paymentIntent.id,
            status: paymentIntent.status,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            description: paymentIntent.description,
            metadata: paymentIntent.metadata,
            customer_id: paymentIntent.customer,
        };
    } catch (error) {
        const errorMessage = error.message || String(error);
        console.error('[ERROR] Stripe API error:', errorMessage);
        return { error: errorMessage, status: 'api_error' };
    }
}

/**
 * Retrieve customer details from Stripe
 */
async function getCustomerDetails(customerId) {
    if (!customerId) {
        return null;
    }

    try {
        const customer = await stripe.customers.retrieve(customerId);
        return {
            id: customer.id,
            email: customer.email,
            name: customer.name,
            phone: customer.phone,
            metadata: customer.metadata
        };
    } catch (error) {
        console.warn(`[WARN] Could not fetch customer ${customerId}:`, error.message);
        return null;
    }
}

/**
 * Retrieve the most recent PaymentIntents from Stripe with optional customer details
 */
async function getRecentPayments(limit = 10, includeCustomerDetails = true) {
    try {
        const paymentIntents = await stripe.paymentIntents.list({ limit });
        const results = [];

        for (const pi of paymentIntents.data) {
            const paymentData = {
                id: pi.id,
                status: pi.status,
                amount: pi.amount,
                currency: pi.currency,
                description: pi.description,
                created: pi.created,
                customer_id: pi.customer,
                metadata: pi.metadata  // Payment metadata (custom fields from checkout)
            };

            // Fetch customer details if requested and customer ID exists
            if (includeCustomerDetails && pi.customer) {
                const customerDetails = await getCustomerDetails(pi.customer);
                if (customerDetails) {
                    paymentData.customer = customerDetails;
                } else {
                    paymentData.customer = null;
                }
            }

            results.push(paymentData);
        }

        console.log(`[DEBUG] Fetched ${results.length} payment intents`);
        return { success: true, count: results.length, payments: results };
    } catch (error) {
        const errorMessage = error.message || String(error);
        console.error('[ERROR] Stripe API error:', errorMessage);
        return { error: errorMessage, status: 'api_error' };
    }
}

// ----------------------------
// ROUTES
// ----------------------------

/**
 * Serves the main HTML page with a simple JavaScript client
 */
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Stripe Payment ID Checking Server</title>
        <script>
            // Client-side JavaScript to handle the request
            async function checkPayment() {
                const paymentIntentId = document.getElementById('txIdInput').value;
                if (!paymentIntentId) {
                    alert("Please enter a Payment Intent ID.");
                    return;
                }

                document.getElementById('paymentStatus').innerText = 'Fetching...';
                document.getElementById('paymentDetails').innerText = 'Fetching details from Stripe...';

                try {
                    // Note the URL uses template literals for the ID
                    const response = await fetch(\`/check-payment/\${paymentIntentId}\`);
                    const data = await response.json();

                    if (data.error) {
                        document.getElementById('paymentStatus').innerText = \`Error: \${data.status}\`;
                        document.getElementById('paymentDetails').innerText = data.error;
                    } else {
                        document.getElementById('paymentStatus').innerText = data.status;
                        document.getElementById('paymentDetails').innerText = JSON.stringify(data, null, 2);
                    }
                } catch (error) {
                    document.getElementById('paymentStatus').innerText = 'Network Error';
                    document.getElementById('paymentDetails').innerText = 'Could not connect to the backend server.';
                }
            }

            async function fetchRecentPayments() {
                document.getElementById('paymentStatus').innerText = 'Fetching recent payments...';
                document.getElementById('paymentDetails').innerText = 'Fetching details from Stripe...';
                
                try {
                    const response = await fetch('/recent-payments');
                    const data = await response.json();
                    if (data.error) {
                        document.getElementById('paymentStatus').innerText = \`Error: \${data.status}\`;
                        document.getElementById('paymentDetails').innerText = data.error;
                    } else {
                        document.getElementById('paymentStatus').innerText = \`Fetched \${data.count} payments\`;
                        document.getElementById('paymentDetails').innerText = JSON.stringify(data.payments, null, 2);
                    }
                } catch (error) {
                    document.getElementById('paymentStatus').innerText = 'Network Error';
                    document.getElementById('paymentDetails').innerText = 'Could not connect to the backend server.';
                }
            }
        </script>
    </head>
    <body>
        <h1>Enter Stripe Payment Transaction ID</h1>
        <label for="txIdInput">Payment Intent ID (e.g., pi_...):</label><br>
        <input type="text" id="txIdInput" style="margin: 10px 0; padding: 5px; width: 300px;">
        <button style="padding: 5px; border: 1px solid black;" onclick="checkPayment()">
            Confirm
        </button>

        <h2>Results</h2>
        <p>
            <strong>Status:</strong>
            <p id="paymentStatus">Awaiting Input</p>
        </p>
        <p>
            <strong>Details:</strong>
            <pre id="paymentDetails">Enter an ID and click 'Confirm' to see details.</pre>
        </p>

        <h1>Get Recent Payment Transactions</h1>
        <button style="padding: 5px; border: 1px solid black;" onclick="fetchRecentPayments()">
           Fetch Recent Payments
        </button>
    </body>
    </html>
    `);
});

/**
 * API endpoint to check a specific Payment Intent ID
 */
app.get('/check-payment/:id', async (req, res) => {
    const { id } = req.params;

    if (!id.startsWith('pi_')) {
        return res.status(400).json({
            error: "Invalid Payment Intent ID format. Must start with 'pi_'",
            status: 'invalid_input'
        });
    }

    const details = await getPaymentDetails(id);

    if (details.error) {
        const statusCode = details.status === 'server_error' ? 500 : 404;
        return res.status(statusCode).json(details);
    }

    res.json(details);
});

/**
 * API endpoint to fetch the last 10 (or specified number) payment intents with customer details
 */
app.get('/recent-payments', async (req, res) => {
    let limit = parseInt(req.query.limit) || 10;
    const includeCustomer = (req.query.include_customer || 'true').toLowerCase() === 'true';

    // Limit the maximum to 100 for safety
    if (limit > 100) limit = 100;
    if (limit < 1) limit = 1;

    const results = await getRecentPayments(limit, includeCustomer);

    if (results.error) {
        const statusCode = results.status === 'server_error' ? 500 : 404;
        return res.status(statusCode).json(results);
    }

    res.json(results);
});

/**
 * API endpoint to verify payment data based on metadata and creation time
 * Verifies payment against:
 * - Time range (start/end)
 * - Package amount
 * - Customer details (email, name, phone)
 * 
 * Request body:
 * {
 *   package: { amount: 250, dollars: 2.5, credits: 2500, priceId: 'price_...' },
 *   timeRange: { start: 1765659602803, end: 1765659639864 },
 *   user: { email: 'user@example.com', username: 'username', phone: '', name: '' }
 * }
 */
app.post('/verify-payment-data', async (req, res) => {
    const { package: pkg, timeRange, user } = req.body;

    if (!pkg || !timeRange || !user) {
        return res.status(400).json({
            error: 'Missing required fields: package, timeRange, and user are required',
            status: 'invalid_input'
        });
    }

    console.log(`[INFO] Verifying payment data for package: ${JSON.stringify(pkg)}, timeRange: ${JSON.stringify(timeRange)}, user: ${JSON.stringify(user)}`);

    const timeRangeStart = timeRange.start;
    const timeRangeEnd = timeRange.end;



    // Fetch recent payments to search through
    const details = await getRecentPayments(20, true);

    if (details.error) {
        const statusCode = details.status === 'server_error' ? 500 : 404;
        return res.status(statusCode).json(details);
    }

    

    let possiblePaymentFound = false;
    const possibleMatchingPayments = [];

    console.log(`[INFO] Searching through ${details.payments.length} recent payments for matches.`);

    // Verify creation time and amount
    for (const payment of details.payments || []) {
        const created = payment.created;

        // Check time range
        if (timeRangeStart && created < timeRangeStart) {
            continue;
        }
        if (timeRangeEnd && created > timeRangeEnd) {
            continue;
        }

        // Check payment amount
        if (payment.amount !== pkg.amount) {
            continue;
        }

        possiblePaymentFound = true;
        possibleMatchingPayments.push(payment);
    }

    if (!possiblePaymentFound) {
        return res.status(404).json({
            error: 'No PaymentIntent found in the specified time range',
            status: 'not_found'
        });
    }

    let potentialVerifiedPayment = null;

    // If multiple possible payments found, verify customer details
    if (possibleMatchingPayments.length > 1) {
        for (const payment of possibleMatchingPayments) {
            const customerData = payment.customer || {};
            const email = customerData.email || '';
            const name = customerData.name || '';
            const phone = customerData.phone || '';

            if (email !== user.email) {
                continue;
            }
            if (name !== user.name) {
                continue;
            }
            if (phone !== user.phone) {
                continue;
            }

            potentialVerifiedPayment = payment;
            break;
        }
    } else {
        potentialVerifiedPayment = possibleMatchingPayments[0];
    }

    if (!potentialVerifiedPayment) {
        return res.status(404).json({
            error: 'No matching PaymentIntent found after verification',
            status: 'not_found'
        });
    }

    console.log(`[INFO] Verified PaymentIntent: ${potentialVerifiedPayment.id}`);

    res.json({
        success: true,
        message: 'PaymentIntent verified successfully',
        details: potentialVerifiedPayment
    });
});

// ----------------------------
// START SERVER
// ----------------------------

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server starting on http://0.0.0.0:${PORT}`);
    console.log(`Using Stripe API Key: ${STRIPE_SECRET_KEY.slice(0, 10)}...`);
});

module.exports = app;
