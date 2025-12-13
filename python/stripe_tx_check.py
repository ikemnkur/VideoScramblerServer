import os
import stripe
from stripe.error import StripeError

from flask import Flask, request, jsonify
from flask_cors import CORS

# ----------------------------
# CONFIGURATION
# ----------------------------
# Set your Stripe Secret Key (Test key for development)
# You can set it as an environment variable: export STRIPE_SECRET_KEY="sk_test_..."
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "sk_test_YOUR_SECRET_KEY_HERE")

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
            "charges": [charge.id for charge in payment_intent.charges.data]
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


if __name__ == '__main__':
    # Use the development server only for testing
    print(f"Server starting on http://0.0.0.0:5005")
    print(f"Using Stripe API Key: {stripe.api_key[:10]}...")
    app.run(host='0.0.0.0', port=5005, debug=True)

