# Phase 1 Verification Evidence

## Image Sizes
```text
IMAGE                  ID             DISK USAGE   CONTENT SIZE   EXTRA
shop-catalog:1.0.0     1cc8f5299528        192MB         50.8MB   U    
shop-frontend:1.0.0    c7a0412e0fdd         22MB          6.2MB   U    
shop-inventory:1.0.0   9c3859a2e746       27.3MB         7.71MB   U    
shop-orders:1.0.0      2edbf676ed75        158MB         63.8MB   U    
```

## Test 1: App loads by domain name (Expected: 200 OK)
```text
$ curl -I http://shoplite.test
HTTP/1.1 200 OK
Server: nginx/1.27.5
Date: Tue, 24 Nov 2026 06:33:20 GMT
Content-Type: text/html
Content-Length: 393
Last-Modified: Tue, 24 Nov 2026 05:50:29 GMT
Connection: keep-alive
ETag: "6b0525a5-189"
Accept-Ranges: bytes

```

## Test 2: APIs work through nginx (Expected: JSON list of 3 products)
```text
$ curl http://shoplite.test/api/catalog/products
[{"id":1,"name":"Keyboard","price":4500},{"id":2,"name":"Mouse","price":1800},{"id":3,"name":"Monitor","price":32000}]
```

## Test 3: End-to-end order (Expected: 201; stock for product 1 drops from 20 to 18)
```text
$ curl -X POST http://shoplite.test/api/orders/orders -H 'Content-Type: application/json' -d '{"productId": 1, "quantity": 2}'
HTTP/1.1 201 
Server: nginx/1.27.5
Date: Tue, 24 Nov 2026 06:33:20 GMT
Content-Type: application/json
Transfer-Encoding: chunked
Connection: keep-alive

{"id":1,"productId":1,"quantity":2,"total":9000.00,"createdAt":"2026-11-24T06:33:20.673439"}
$ curl http://shoplite.test/api/inventory/stock/1
{"productId":1,"quantity":18}

```

## Test 4: Backends aren't published (Expected: Connection refused; only frontend shows a host port)
```text
$ curl localhost:3000
curl: (7) Failed to connect to localhost port 3000 after 0 ms: Could not connect to server
$ curl localhost:8081
curl: (7) Failed to connect to localhost port 8081 after 0 ms: Could not connect to server
$ curl localhost:8082
curl: (7) Failed to connect to localhost port 8082 after 0 ms: Could not connect to server
$ docker ps --format '{{.Names}} {{.Ports}}'
frontend 0.0.0.0:80->80/tcp, [::]:80->80/tcp
orders 8082/tcp
inventory 8081/tcp
catalog 3000/tcp
postgres 5432/tcp
```

## Test 5: frontend-net cannot see Postgres (Expected: bad address 'postgres')
```text
$ docker run --rm --network frontend-net busybox wget -T 3 -qO- http://postgres:5432
wget: bad address 'postgres:5432'
```

## Test 6: Backends reach each other on backend-net (Expected: {"status":"ok"})
```text
$ docker run --rm --network backend-net busybox wget -qO- http://catalog:3000/health
{"status":"ok"}
```

## Test 7: Postgres has no internet (Expected: Fails)
```text
$ docker exec postgres wget -T 5 -qO- https://example.com
wget: bad address 'example.com'
```

## Test 8: Data survives restart (Expected: Order from Test 3 is still there)
```text
$ ./scripts/down.sh && ./scripts/up.sh
Stopped stack (pgdata volume preserved).
0f770b77dfbb74a56ba76a80b1c320101f916f953dacc2999910a923a3b6bb36
be312a747c2a254b90b2d68eed59263fcf4c973f1adb3c145bddf1dcf9330e9c
79c9be82b242c96a557307c9013bec9b13929e4c3c26482ba1b1720bc95d7f0a
[OK] postgres is healthy
f0a11a1dd8208fcafce53c082d368ae3baf1251714f904daaaa2dad374d1d7e4
840973be5976b45c40dc94a2e187b169ec320d522cb21f19d3efbd7fbaf5a096
a3d5dc783c9ee7c27e444191bc8038672499545afe0f2999657c32c9717f9452
[OK] catalog is healthy
[OK] inventory is healthy
[OK] orders is healthy
b35feb44473a974f955deafa061aaa4340215b7d41c3c5c10aaaec75854330fb
[OK] frontend is healthy
ShopLite is running at http://shoplite.test
$ curl http://shoplite.test/api/orders/orders
[{"id":1,"productId":1,"quantity":2,"total":9000.00,"createdAt":"2026-11-24T06:33:20.673439"}]
```

## Test 9: Only purge deletes data (Expected: Empty order list, stock back to 20)
```text
$ ./scripts/down.sh --purge && ./scripts/up.sh
Stopped stack and purged pgdata volume.
995679f4207d306a1cb89cfec3a060ed44e93f9db3c460da89468f017e83082d
81ad5ca6a7d547ec4c836724f7494eac1cc59ef3ef02c157199d06735a739bd2
pgdata
cbe1b9b22946d7ebe7ac612f0d8059f55538163cb80398c4aceac612eaa21ad1
[OK] postgres is healthy
51fc138d0397846a5c4d7d261f8827d431ef1a6787d4fdf7aa8a372e82a5c6e1
170bf10f860777e11cbbde4c162f7fb1f5eb618eee4e72353e50266f80aa2c5e
33715fe76519cf9cdf470acf7f766a990ed71700fea04c7acaf0bb6361acf892
[OK] catalog is healthy
[OK] inventory is healthy
[OK] orders is healthy
70fc3d32bab523760be38c6da42b8723c883873612f6dbdc4b9c73e83746ee81
[OK] frontend is healthy
ShopLite is running at http://shoplite.test
$ curl http://shoplite.test/api/orders/orders
[]
$ curl http://shoplite.test/api/inventory/stock/1
{"productId":1,"quantity":20}

```

## Test 10: Only the domain is served (Expected: Empty reply from server for both)
```text
$ curl -v http://127.0.0.1
  % Total    % Received % Xferd  Average Speed  Time    Time    Time   Current
                                 Dload  Upload  Total   Spent   Left   Speed
  0      0   0      0   0      0      0      0                              0*   Trying 127.0.0.1:80...
* Established connection to 127.0.0.1 (127.0.0.1 port 80) from 127.0.0.1 port 33452 
* using HTTP/1.x
> GET / HTTP/1.1
> Host: 127.0.0.1
> User-Agent: curl/8.18.0
> Accept: */*
> 
* Request completely sent off
  0      0   0      0   0      0      0      0                              0  0      0   0      0   0      0      0      0                              0* Empty reply from server
  0      0   0      0   0      0      0      0                              0
* shutting down connection #0
curl: (52) Empty reply from server
$ curl -v -H 'Host: other.test' http://127.0.0.1
  % Total    % Received % Xferd  Average Speed  Time    Time    Time   Current
                                 Dload  Upload  Total   Spent   Left   Speed
  0      0   0      0   0      0      0      0                              0*   Trying 127.0.0.1:80...
* Established connection to 127.0.0.1 (127.0.0.1 port 80) from 127.0.0.1 port 33462 
* using HTTP/1.x
> GET / HTTP/1.1
> Host: other.test
> User-Agent: curl/8.18.0
> Accept: */*
> 
* Request completely sent off
  0      0   0      0   0      0      0      0                              0  0      0   0      0   0      0      0      0                              0* Empty reply from server
  0      0   0      0   0      0      0      0                              0
* shutting down connection #0
curl: (52) Empty reply from server
```

## Network Inspection (frontend-net and backend-net)
```json
[
    {
        "Name": "frontend-net",
        "Id": "995679f4207d306a1cb89cfec3a060ed44e93f9db3c460da89468f017e83082d",
        "Created": "2026-11-24T11:33:52.603588795+05:00",
        "Scope": "local",
        "Driver": "bridge",
        "EnableIPv4": true,
        "EnableIPv6": false,
        "IPAM": {
            "Driver": "default",
            "Options": {},
            "Config": [
                {
                    "Subnet": "172.18.0.0/16",
                    "Gateway": "172.18.0.1"
                }
            ]
        },
        "Internal": false,
        "Attachable": false,
        "Ingress": false,
        "ConfigFrom": {
            "Network": ""
        },
        "ConfigOnly": false,
        "Options": {},
        "Labels": {},
        "Containers": {
            "170bf10f860777e11cbbde4c162f7fb1f5eb618eee4e72353e50266f80aa2c5e": {
                "Name": "inventory",
                "EndpointID": "d8d7658d677462983b84356c5dd5bc217ea3274b2fbd138dfe75d9b145836ee1",
                "MacAddress": "3a:cc:65:1c:ff:d1",
                "IPv4Address": "172.18.0.3/16",
                "IPv6Address": ""
            },
            "33715fe76519cf9cdf470acf7f766a990ed71700fea04c7acaf0bb6361acf892": {
                "Name": "orders",
                "EndpointID": "14eeb1935220fbbd48caff0cdbf856483b5d38bdba637661a30356348d130b8a",
                "MacAddress": "2e:99:42:17:2f:ba",
                "IPv4Address": "172.18.0.4/16",
                "IPv6Address": ""
            },
            "51fc138d0397846a5c4d7d261f8827d431ef1a6787d4fdf7aa8a372e82a5c6e1": {
                "Name": "catalog",
                "EndpointID": "1171653ee2d44fda8a0b305e6986bb5d1d4b72a7ef353c05d8852856cb976d78",
                "MacAddress": "06:24:b8:ea:6d:61",
                "IPv4Address": "172.18.0.2/16",
                "IPv6Address": ""
            },
            "70fc3d32bab523760be38c6da42b8723c883873612f6dbdc4b9c73e83746ee81": {
                "Name": "frontend",
                "EndpointID": "89904babc56f5bab81329632937e5e06ec0741eea78d5b68dcb3493a017243b0",
                "MacAddress": "2a:ad:b5:25:a0:23",
                "IPv4Address": "172.18.0.5/16",
                "IPv6Address": ""
            }
        },
        "Status": {
            "IPAM": {
                "Subnets": {
                    "172.18.0.0/16": {
                        "IPsInUse": 7,
                        "DynamicIPsAvailable": 65529
                    }
                }
            }
        }
    },
    {
        "Name": "backend-net",
        "Id": "81ad5ca6a7d547ec4c836724f7494eac1cc59ef3ef02c157199d06735a739bd2",
        "Created": "2026-11-24T11:33:52.733275391+05:00",
        "Scope": "local",
        "Driver": "bridge",
        "EnableIPv4": true,
        "EnableIPv6": false,
        "IPAM": {
            "Driver": "default",
            "Options": {},
            "Config": [
                {
                    "Subnet": "172.19.0.0/16",
                    "Gateway": "172.19.0.1"
                }
            ]
        },
        "Internal": true,
        "Attachable": false,
        "Ingress": false,
        "ConfigFrom": {
            "Network": ""
        },
        "ConfigOnly": false,
        "Options": {},
        "Labels": {},
        "Containers": {
            "170bf10f860777e11cbbde4c162f7fb1f5eb618eee4e72353e50266f80aa2c5e": {
                "Name": "inventory",
                "EndpointID": "7c181aeed27b65eef24e69ce850a7a8f6b9b9e3e271370ebd607c7c116d77c6a",
                "MacAddress": "0e:db:a0:0e:89:4d",
                "IPv4Address": "172.19.0.4/16",
                "IPv6Address": ""
            },
            "33715fe76519cf9cdf470acf7f766a990ed71700fea04c7acaf0bb6361acf892": {
                "Name": "orders",
                "EndpointID": "414526f56b0b4919cb98482d144a45329fbd5fbef4c1ef0c5afa84aa29cb4544",
                "MacAddress": "76:ff:5b:66:3c:07",
                "IPv4Address": "172.19.0.5/16",
                "IPv6Address": ""
            },
            "51fc138d0397846a5c4d7d261f8827d431ef1a6787d4fdf7aa8a372e82a5c6e1": {
                "Name": "catalog",
                "EndpointID": "16b587a5aa0e8d8fcc4055b7a55bc7a053f7c90ee2780690398bb81c7736b54a",
                "MacAddress": "fe:91:f0:98:75:3a",
                "IPv4Address": "172.19.0.3/16",
                "IPv6Address": ""
            },
            "cbe1b9b22946d7ebe7ac612f0d8059f55538163cb80398c4aceac612eaa21ad1": {
                "Name": "postgres",
                "EndpointID": "5ceac9f5fb067dae20ad2491d583d1873bbbfaca23eade6d4d8a54543a2be91e",
                "MacAddress": "16:ff:ac:ad:51:0f",
                "IPv4Address": "172.19.0.2/16",
                "IPv6Address": ""
            }
        },
        "Status": {
            "IPAM": {
                "Subnets": {
                    "172.19.0.0/16": {
                        "IPsInUse": 7,
                        "DynamicIPsAvailable": 65529
                    }
                }
            }
        }
    }
]
```
