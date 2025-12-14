import os
import stripe
from stripe import StripeError

from flask import Flask, request, jsonify
from flask_cors import CORS

# ----------------------------
# CONFIGURATION
# ----------------------------
# Set your Stripe Secret Key (Test key for development)
# You can set it as an environment variable: export STRIPE_SECRET_KEY="sk_test_..."
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")

# ----------------------------
# INITIALIZE STRIPE
# ----------------------------
stripe.api_key = STRIPE_SECRET_KEY

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

def get_payment_details(payment_intent_id):
    """Retrieve the latest details of a PaymentIntent from Stripe."""
    try:
        payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        return {
            "id": payment_intent.id,
            "status": payment_intent.status,
            "amount": payment_intent.amount,
            "currency": payment_intent.currency,
            "description": payment_intent.description,
            # "charges": [charge.id for charge in payment_intent.charges.data]
        }
    except StripeError as e:
        # Handle specific Stripe API errors (e.g., invalid ID, authentication errors)
        error_message = e.user_message or str(e)
        print(f"[ERROR] Stripe API error: {error_message}")
        return {"error": error_message, "status": "api_error"}
    except Exception as e:
        # Handle other unexpected errors
        print(f"[ERROR] Unexpected error: {str(e)}")
        return {"error": "An unexpected server error occurred", "status": "server_error"}

def get_customer_details(customer_id):
    """Retrieve customer details from Stripe."""
    if not customer_id:
        return None
    
    try:
        customer = stripe.Customer.retrieve(customer_id)
        return {
            "id": customer.id,
            "email": customer.email,
            "name": customer.name,
            "phone": customer.phone,
            "metadata": customer.metadata
        }
    except StripeError as e:
        print(f"[WARN] Could not fetch customer {customer_id}: {str(e)}")
        return None
    except Exception as e:
        print(f"[WARN] Unexpected error fetching customer: {str(e)}")
        return None

def get_recent_payments(limit=5, include_customer_details=True):
    """Retrieve the most recent PaymentIntents from Stripe with optional customer details."""
    try:
        payment_intents = stripe.PaymentIntent.list(limit=limit)
        results = []
        
        for pi in payment_intents.data:
            payment_data = {
                "id": pi.id,
                "status": pi.status,
                "amount": pi.amount,
                "currency": pi.currency,
                "description": pi.description,
                "created": pi.created,
                "customer_id": pi.customer,
                "metadata": pi.metadata  # Payment metadata (custom fields from checkout)
            }
            
            # Fetch customer details if requested and customer ID exists
            if include_customer_details and pi.customer:
                customer_details = get_customer_details(pi.customer)
                if customer_details:
                    payment_data["customer"] = customer_details
                else:
                    payment_data["customer"] = None
            
            results.append(payment_data)
        
        print(f"[DEBUG] Fetched {len(results)} payment intents")
        return {"success": True, "count": len(results), "payments": results}
    except StripeError as e:
        error_message = e.user_message or str(e)
        print(f"[ERROR] Stripe API error: {error_message}")
        return {"error": error_message, "status": "api_error"}
    except Exception as e:
        print(f"[ERROR] Unexpected error: {str(e)}")
        return {"error": "An unexpected server error occurred", "status": "server_error"}

@app.route('/')
def index():
    """Serves the main HTML page with a simple JavaScript client."""
    return '''
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
                    const response = await fetch(`/check-payment/${paymentIntentId}`);
                    const data = await response.json();

                    if (data.error) {
                        document.getElementById('paymentStatus').innerText = `Error: ${data.status}`;
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

                        document.getElementById('paymentStatus').innerText = `Error: ${data.status}`;
                        document.getElementById('paymentDetails').innerText = data.error;
                    } else {
                        document.getElementById('paymentStatus').innerText = `Fetched ${data.count} payments`;
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

        <h1>Get  Recent Payment Transactions</h1>
        <button style="padding: 5px; border: 1px solid black;" onclick="fetchRecentPayments()">
           Fetch Recent Payments
        </button>
    </body>
    </html>
    '''

@app.route('/check-payment/<string:id>', methods=['GET'])
def check_payment_route(id):
    """API endpoint to check a specific Payment Intent ID."""
    if not id.startswith('pi_'):
        return jsonify({"error": "Invalid Payment Intent ID format. Must start with 'pi_'", "status": "invalid_input"}), 400

    details = get_payment_details(id)

    if "error" in details:
        # Return an appropriate HTTP status code for errors
        status_code = 500 if details.get("status") == "server_error" else 404
        return jsonify(details), status_code
    
    return jsonify(details), 200

@app.route('/recent-payments', methods=['GET'])
def recent_payments_route():
    """API endpoint to fetch the last 10 (or specified number) payment intents with customer details."""
    limit = request.args.get('limit', default=5, type=int)
    include_customer = request.args.get('include_customer', default='true', type=str).lower() == 'true'
    
    # Limit the maximum to 100 for safety
    if limit > 100:
        limit = 100
    if limit < 1:
        limit = 1
    
    results = get_recent_payments(limit, include_customer_details=include_customer)
    
    if "error" in results:
        status_code = 500 if results.get("status") == "server_error" else 404
        return jsonify(results), status_code
    
    return jsonify(results), 200




# verify that a payment detail are valid, by search the "created" times 
# and the "metadata" fields for custom data
# Example metadata content:
# package : {amount: 250, dollars: 2.5, credits: 2500, priceId: 'price_1SR9nNEViYxfJNd2pijdhiBM'}
# timeRange: {start: 1765659602803, end: 1765659639864}
# user: {email: 'ikemuru@gmail.com', username: 'ikemuru', phone: '', name: ''}

@app.route('/verify-payment-data', methods=['POST'])
def verify_payment_data_route():
    """API endpoint to verify payment data based on metadata and creation time."""
    # payment_intent_id = request.args.get('payment_intent_id', type=str)
    # expected_metadata = request.args.get('expected_metadata', type=str)  # JSON string
    package = request.json.get('package', {})
    timeRange = request.json.get('timeRange', {})
    user = request.json.get('user', {})
    
    time_range_start = timeRange.get('start')
    time_range_end = timeRange.get('end')




    details = get_recent_payments(limit=20, include_customer_details=True)

    if "error" in details:
        status_code = 500 if details.get("status") == "server_error" else 404
        return jsonify(details), status_code

    possible_payment_found = False
    possibleMatchingPayments = []

    # Verify creation time
    for payment in details.get("payments", []):
        created = payment.get("created")
        # check start and end time range
        if time_range_start and created < time_range_start:
            continue
        if time_range_end and created > time_range_end:
            continue
        # check the payment amount
        if payment.get("amount") != package.get("amount"):
            continue
        
        possible_payment_found = True
        possibleMatchingPayments.append(payment)
        
    if not possible_payment_found:
        return jsonify({"error": "No PaymentIntent found in the specified time range", "status": "not_found"}), 404
    
    pontential_verified_payment = None

    # If multiple possible payments found, search and further verify customer details
    if len(possibleMatchingPayments) > 1:
        # Veify each possbile customer's details
        for payment in possibleMatchingPayments:

            customerData = payment.get("customer", {})
            email = customerData.get("email", "")
            name = customerData.get("name", "")
            phone = customerData.get("phone", "")
            if email != user.get("email"):
                continue
            if name != user.get("name"):
                continue
            if phone != user.get("phone"):
                continue
            pontential_verified_payment = payment
            break
    else:
        pontential_verified_payment = possibleMatchingPayments[0]   

        # # Verify metadata
        # if expected_metadata:
        #     import json
        #     try:
        #         expected_meta_dict = json.loads(expected_metadata)
        #         actual_metadata = details.get("metadata", {})
        #         for key, value in expected_meta_dict.items():
        #             if str(actual_metadata.get(key)) != str(value):
        #                 return jsonify({"error": f"Metadata mismatch for key '{key}'", "status": "metadata_mismatch"}), 400
        #     except json.JSONDecodeError:
        #         return jsonify({"error": "Invalid expected_metadata format. Must be a valid JSON string.", "status": "invalid_input"}), 400

    if not pontential_verified_payment:
        return jsonify({"error": "No matching PaymentIntent found after verification", "status": "not_found"}), 404

    print(f"[INFO] Verified PaymentIntent: {pontential_verified_payment.get('id')}")

    return jsonify({"success": True, "message": "PaymentIntent verified successfully", "details": details}), 200


if __name__ == '__main__':
    # Use the development server only for testing
    print(f"Server starting on http://0.0.0.0:5005")
    print(f"Using Stripe API Key: {stripe.api_key[:10]}...")
    app.run(host='0.0.0.0', port=5005, debug=True)

