import os
import re
import requests
from bs4 import BeautifulSoup


def verify_transaction_exists(tx_hash: str,
                              network: str = "litecoin",
                              api_key: str | None = None,
                              timeout: int = 15) -> dict:
    """
    Verifies that a given transaction exists on-chain using APIs instead of scraping HTML.

    Primary: Blockchair API (optionally with API key via env `BLOCKCHAIR_API_KEY`).
    Fallbacks: BlockCypher, Chain.so.

    Returns a dict: {
        'found': bool,
        'source': 'blockchair'|'blockcypher'|'chain.so'|None,
        'details': {...}  # minimal fields when available
    }
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/119.0 Safari/537.36'
    }

    # --- Blockchair ---
    try:
        if api_key is None:
            api_key = os.getenv("BLOCKCHAIR_API_KEY")
        bc_url = f"https://api.blockchair.com/{network}/dashboards/transaction/{tx_hash}"
        params = {"key": api_key} if api_key else {}
        r = requests.get(bc_url, headers=headers, params=params, timeout=timeout)
        if r.status_code == 200:
            data = r.json()
            # Blockchair returns data keyed by the tx hash
            tx_block = data.get("data", {}).get(tx_hash, {})
            if tx_block.get("transaction"):
                return {
                    "found": True,
                    "source": "blockchair",
                    "details": {
                        "hash": tx_hash,
                        "block_id": tx_block.get("transaction", {}).get("block_id"),
                        "time": tx_block.get("transaction", {}).get("time"),
                        "size": tx_block.get("transaction", {}).get("size"),
                    },
                }
        # 401/403 often indicate key or anti-bot restrictions
    except Exception:
        pass

    # --- BlockCypher ---
    try:
        bc_url = f"https://api.blockcypher.com/v1/ltc/main/txs/{tx_hash}"
        r = requests.get(bc_url, headers=headers, timeout=timeout)
        if r.status_code == 200:
            j = r.json()
            if j.get("hash") == tx_hash:
                return {
                    "found": True,
                    "source": "blockcypher",
                    "details": {
                        "hash": j.get("hash"),
                        "confirmed": j.get("confirmed"),
                        "block_height": j.get("block_height"),
                        "total": j.get("total"),
                    },
                }
    except Exception:
        pass

    # --- Chain.so ---
    try:
        cs_url = f"https://chain.so/api/v2/get_tx/LTC/{tx_hash}"
        r = requests.get(cs_url, headers=headers, timeout=timeout)
        if r.status_code == 200:
            j = r.json()
            if j.get("status") == "success" and j.get("data", {}).get("txid") == tx_hash:
                return {
                    "found": True,
                    "source": "chain.so",
                    "details": {
                        "hash": j["data"].get("txid"),
                        "block_no": j["data"].get("block_no"),
                        "confirmations": j["data"].get("confirmations"),
                    },
                }
    except Exception:
        pass

    return {"found": False, "source": None, "details": {}}

def download_and_count_text(url, search_terms):
    """
    Downloads an HTML page and counts occurrences of provided terms.
    Note: Some sites (like Blockchair HTML) block bots and may return 401/403.
    Prefer using the API-based verification above for transactions.
    """
    print(f"Downloading from {url}...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/119.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, 'html.parser')
    for element in soup(["script", "style", "img", "video", "canvas", "header", "footer"]):
        element.extract()

    clean_text = soup.get_text(separator=' ')
    with open("page_text_only.txt", "w", encoding="utf-8") as f:
        f.write(clean_text)
    print("Cleaned text saved to 'page_text_only.txt'")

    results = {}
    for term in search_terms:
        matches = re.findall(re.escape(term), clean_text, re.IGNORECASE)
        results[term] = len(matches)
    return results

# --- INPUTS ---
search_array = [
    "USD",
    "coin",
    "science",
    "ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh",
    "transaction",
    "blockchain",
]
tx_hash = "40aa886e5202c1f96223a253c114abe570c82d665569fe186739cd80d6a06a5a"
html_target_url = f"https://blockchair.com/litecoin/transaction/{tx_hash}"

# --- EXECUTION ---
print("Verifying transaction via APIs (avoids HTML 401/403 blocks)...")
verification = verify_transaction_exists(tx_hash)
print("Verification:")
print(verification)

# Optional: still attempt HTML keyword counts if you need them
try:
    final_output = download_and_count_text(html_target_url, search_array)
    print("\nFinal Key-Value Mapping:")
    print(final_output)
except requests.HTTPError as e:
    print(f"HTML fetch blocked/failed: {e}. Consider relying on API verification above.")

# install requirements
# pip install requests beautifulsoup4
