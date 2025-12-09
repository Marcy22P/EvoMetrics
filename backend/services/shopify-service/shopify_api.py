import httpx
import hmac
import hashlib
import os
from typing import Optional, Dict, List
from datetime import datetime, timedelta

class ShopifyAPI:
    def __init__(self):
        self.api_key = os.getenv("SHOPIFY_API_KEY")
        self.api_secret = os.getenv("SHOPIFY_API_SECRET")
        self.scopes = os.getenv("SHOPIFY_SCOPES", "read_orders,read_products,read_customers,read_analytics")
    
    def generate_oauth_url(self, shop: str, redirect_uri: str, state: str) -> str:
        """Genera URL per OAuth authorization"""
        # Normalizza shop name: rimuovi .myshopify.com se presente
        shop_normalized = shop.strip().lower()
        if shop_normalized.endswith('.myshopify.com'):
            shop_normalized = shop_normalized.replace('.myshopify.com', '')
        base_url = f"https://{shop_normalized}.myshopify.com/admin/oauth/authorize"
        params = {
            "client_id": self.api_key,
            "scope": self.scopes,
            "redirect_uri": redirect_uri,
            "state": state
        }
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{base_url}?{query_string}"
    
    def verify_hmac(self, query_params: dict, hmac_param: str) -> bool:
        """Verifica HMAC signature da Shopify"""
        params = {k: v for k, v in query_params.items() if k not in ['hmac', 'signature']}
        sorted_params = sorted(params.items())
        message = "&".join([f"{k}={v}" for k, v in sorted_params])
        calculated_hmac = hmac.new(
            self.api_secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(calculated_hmac, hmac_param)
    
    async def exchange_code_for_token(self, shop: str, code: str) -> Dict:
        """Scambia authorization code per access token"""
        # Normalizza shop name
        shop_normalized = shop.strip().lower()
        if shop_normalized.endswith('.myshopify.com'):
            shop_normalized = shop_normalized.replace('.myshopify.com', '')
        url = f"https://{shop_normalized}.myshopify.com/admin/oauth/access_token"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={
                    "client_id": self.api_key,
                    "client_secret": self.api_secret,
                    "code": code
                }
            )
            response.raise_for_status()
            return response.json()
    
    async def get_orders(
        self, 
        shop: str, 
        access_token: str,
        limit: int = 250,
        since_id: Optional[int] = None,
        created_at_min: Optional[str] = None
    ) -> List[Dict]:
        """Recupera ordini da Shopify usando GraphQL API"""
        # Normalizza shop name
        shop_normalized = shop.strip().lower()
        if shop_normalized.endswith('.myshopify.com'):
            shop_normalized = shop_normalized.replace('.myshopify.com', '')
        
        url = f"https://{shop_normalized}.myshopify.com/admin/api/2024-10/graphql.json"
        
        # Query GraphQL per recuperare ordini
        query = """
        query getOrders($first: Int!, $query: String) {
          orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                legacyResourceId
                name
                createdAt
                displayFinancialStatus
                displayFulfillmentStatus
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                currentTotalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                subtotalPriceSet {
                  shopMoney {
                    amount
                  }
                }
                totalTaxSet {
                  shopMoney {
                    amount
                  }
                }
                customer {
                  id
                  displayName
                  email
                }
                lineItems(first: 10) {
                  edges {
                    node {
                      title
                      quantity
                      originalUnitPriceSet {
                        shopMoney {
                          amount
                        }
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        """
        
        # Costruisci query string per filtri
        query_parts = []
        if created_at_min:
            # Converti formato ISO in formato Shopify (YYYY-MM-DD)
            date_str = created_at_min.split('T')[0]
            query_parts.append(f"created_at:>={date_str}")
        
        variables = {
            "first": limit,
            "query": " AND ".join(query_parts) if query_parts else None
        }
        
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url, 
                headers=headers, 
                json={"query": query, "variables": variables}
            )
            
            response.raise_for_status()
            data = response.json()
            
            # Converti formato GraphQL a formato REST per compatibilità
            if "data" in data and "orders" in data["data"]:
                orders = []
                for edge in data["data"]["orders"]["edges"]:
                    node = edge["node"]
                    # Converti da formato GraphQL a formato REST-like
                    order = {
                        "id": node["legacyResourceId"],
                        "name": node["name"],
                        "created_at": node["createdAt"],
                        "financial_status": node["displayFinancialStatus"].lower() if node["displayFinancialStatus"] else "unknown",
                        "fulfillment_status": node["displayFulfillmentStatus"].lower() if node["displayFulfillmentStatus"] else None,
                        "total_price": node["totalPriceSet"]["shopMoney"]["amount"],
                        "currency": node["totalPriceSet"]["shopMoney"]["currencyCode"],
                        "subtotal_price": node["subtotalPriceSet"]["shopMoney"]["amount"],
                        "total_tax": node["totalTaxSet"]["shopMoney"]["amount"],
                        "customer": {
                            "id": node["customer"]["id"] if node["customer"] else None,
                            "name": node["customer"]["displayName"] if node["customer"] else None,
                            "email": node["customer"]["email"] if node["customer"] else None
                        } if node["customer"] else None,
                        "line_items": [
                            {
                                "title": item["node"]["title"],
                                "quantity": item["node"]["quantity"],
                                "price": item["node"]["originalUnitPriceSet"]["shopMoney"]["amount"]
                            }
                            for item in node["lineItems"]["edges"]
                        ]
                    }
                    orders.append(order)
                return orders
            
            # Se ci sono errori GraphQL
            if "errors" in data:
                raise Exception(f"GraphQL errors: {data['errors']}")
            
            return []
    
    async def get_order_analytics(
        self,
        shop: str,
        access_token: str,
        start_date: str,
        end_date: str
    ) -> Dict:
        """Calcola metriche ordini per periodo"""
        orders = await self.get_orders(shop, access_token, created_at_min=start_date)
        end_datetime = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        filtered_orders = [
            o for o in orders 
            if datetime.fromisoformat(o['created_at'].replace('Z', '+00:00')) <= end_datetime
        ]
        total_orders = len(filtered_orders)
        total_revenue = sum(float(order.get('total_price', 0)) for order in filtered_orders)
        aov = total_revenue / total_orders if total_orders > 0 else 0
        status_counts = {}
        for order in filtered_orders:
            status = order.get('financial_status', 'unknown')
            status_counts[status] = status_counts.get(status, 0) + 1
        return {
            "total_orders": total_orders,
            "total_revenue": round(total_revenue, 2),
            "average_order_value": round(aov, 2),
            "orders_by_status": status_counts,
            "period": {"start": start_date, "end": end_date}
        }
    
    async def get_shop_info(self, shop: str, access_token: str) -> Dict:
        """Recupera informazioni base dello shop usando GraphQL (test connessione)"""
        # Normalizza shop name
        shop_normalized = shop.strip().lower()
        if shop_normalized.endswith('.myshopify.com'):
            shop_normalized = shop_normalized.replace('.myshopify.com', '')
        
        url = f"https://{shop_normalized}.myshopify.com/admin/api/2024-10/graphql.json"
        
        # Query GraphQL per info shop
        query = """
        query {
          shop {
            id
            name
            email
            myshopifyDomain
            primaryDomain {
              url
              host
            }
            plan {
              displayName
              partnerDevelopment
              shopifyPlus
            }
            currencyCode
            timezoneAbbreviation
            ianaTimezone
            weightUnit
            unitSystem
            createdAt
            updatedAt
          }
        }
        """
        
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                url, 
                headers=headers, 
                json={"query": query}
            )
            
            response.raise_for_status()
            data = response.json()
            
            # Converti formato GraphQL a formato REST-like per compatibilità
            if "data" in data and "shop" in data["data"]:
                shop_data = data["data"]["shop"]
                return {
                    "id": shop_data["id"],
                    "name": shop_data["name"],
                    "email": shop_data["email"],
                    "domain": shop_data["myshopifyDomain"],
                    "primary_domain": shop_data["primaryDomain"]["host"] if shop_data["primaryDomain"] else None,
                    "plan_name": shop_data["plan"]["displayName"] if shop_data["plan"] else None,
                    "currency": shop_data["currencyCode"],
                    "timezone": shop_data["timezoneAbbreviation"],
                    "iana_timezone": shop_data["ianaTimezone"],
                    "created_at": shop_data["createdAt"],
                    "updated_at": shop_data["updatedAt"]
                }
            
            # Se ci sono errori GraphQL
            if "errors" in data:
                raise Exception(f"GraphQL errors: {data['errors']}")
            
            return {}
    
    async def get_products(
        self, 
        shop: str, 
        access_token: str,
        limit: int = 250
    ) -> List[Dict]:
        """Recupera prodotti da Shopify usando GraphQL API"""
        # Normalizza shop name
        shop_normalized = shop.strip().lower()
        if shop_normalized.endswith('.myshopify.com'):
            shop_normalized = shop_normalized.replace('.myshopify.com', '')
        
        url = f"https://{shop_normalized}.myshopify.com/admin/api/2024-10/graphql.json"
        
        # Query GraphQL per prodotti
        query = """
        query getProducts($first: Int!) {
          products(first: $first, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                legacyResourceId
                title
                descriptionHtml
                handle
                status
                createdAt
                updatedAt
                totalInventory
                priceRangeV2 {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                  maxVariantPrice {
                    amount
                    currencyCode
                  }
                }
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      price
                      sku
                      inventoryQuantity
                    }
                  }
                }
                images(first: 1) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        """
        
        variables = {"first": limit}
        
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url, 
                headers=headers, 
                json={"query": query, "variables": variables}
            )
            
            response.raise_for_status()
            data = response.json()
            
            # Converti formato GraphQL a formato REST-like
            if "data" in data and "products" in data["data"]:
                products = []
                for edge in data["data"]["products"]["edges"]:
                    node = edge["node"]
                    product = {
                        "id": node["legacyResourceId"],
                        "title": node["title"],
                        "description": node["descriptionHtml"],
                        "handle": node["handle"],
                        "status": node["status"].lower(),
                        "created_at": node["createdAt"],
                        "updated_at": node["updatedAt"],
                        "total_inventory": node["totalInventory"],
                        "price_min": node["priceRangeV2"]["minVariantPrice"]["amount"],
                        "price_max": node["priceRangeV2"]["maxVariantPrice"]["amount"],
                        "currency": node["priceRangeV2"]["minVariantPrice"]["currencyCode"],
                        "variants": [
                            {
                                "id": v["node"]["id"],
                                "title": v["node"]["title"],
                                "price": v["node"]["price"],
                                "sku": v["node"]["sku"],
                                "inventory_quantity": v["node"]["inventoryQuantity"]
                            }
                            for v in node["variants"]["edges"]
                        ],
                        "image_url": node["images"]["edges"][0]["node"]["url"] if node["images"]["edges"] else None
                    }
                    products.append(product)
                return products
            
            if "errors" in data:
                raise Exception(f"GraphQL errors: {data['errors']}")
            
            return []
    
    async def get_customers(
        self, 
        shop: str, 
        access_token: str,
        limit: int = 250
    ) -> List[Dict]:
        """Recupera clienti da Shopify usando GraphQL API"""
        # Normalizza shop name
        shop_normalized = shop.strip().lower()
        if shop_normalized.endswith('.myshopify.com'):
            shop_normalized = shop_normalized.replace('.myshopify.com', '')
        
        url = f"https://{shop_normalized}.myshopify.com/admin/api/2024-10/graphql.json"
        
        # Query GraphQL per clienti
        query = """
        query getCustomers($first: Int!) {
          customers(first: $first, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                legacyResourceId
                displayName
                firstName
                lastName
                email
                phone
                createdAt
                updatedAt
                numberOfOrders
                amountSpent {
                  amount
                  currencyCode
                }
                tags
                addresses(first: 1) {
                  address1
                  address2
                  city
                  province
                  country
                  zip
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        """
        
        variables = {"first": limit}
        
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url, 
                headers=headers, 
                json={"query": query, "variables": variables}
            )
            
            response.raise_for_status()
            data = response.json()
            
            # Converti formato GraphQL a formato REST-like
            if "data" in data and "customers" in data["data"]:
                customers = []
                for edge in data["data"]["customers"]["edges"]:
                    node = edge["node"]
                    customer = {
                        "id": node["legacyResourceId"],
                        "name": node["displayName"],
                        "first_name": node["firstName"],
                        "last_name": node["lastName"],
                        "email": node["email"],
                        "phone": node["phone"],
                        "created_at": node["createdAt"],
                        "updated_at": node["updatedAt"],
                        "orders_count": node["numberOfOrders"],
                        "total_spent": node["amountSpent"]["amount"],
                        "currency": node["amountSpent"]["currencyCode"],
                        "tags": node["tags"],
                        "default_address": node["addresses"][0] if node["addresses"] else None
                    }
                    customers.append(customer)
                return customers
            
            if "errors" in data:
                raise Exception(f"GraphQL errors: {data['errors']}")
            
            return []

