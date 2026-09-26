# Reverse proxy setup with Traefik

Status: 2026-09-18, planned procedure. This runbook is the manual setup of the reverse proxy on a host that has none, for a customer-hosted deployment in either management mode (`DEC-33`). No step in it was run against a customer host yet. The configuration keys were checked against the Traefik 3 documentation on 2026-09-18, and the shape mirrors a running Traefik 3 host in Genie's own environment. The first customer setup confirms it, and every "make sure that" line is a check for that run.

What the proxy does: it is the only process on ports 80 and 443, it obtains and renews the certificate, it terminates HTTPS, and it forwards each hostname to one container. The application never terminates HTTPS itself and reads only `PUBLIC_URL` (`DEC-19`). A host that already has a reverse proxy or a cloud load balancer keeps it and applies only the requirements in "What any proxy must do" at the end.

Why Traefik: it runs as one container, it reads its routes from a file, it renews certificates on its own, and it is what Genie runs on its own hosts, so one set of instructions serves every hosting mode.

## Before you start

Make sure that the host has the following.

- Docker with the Compose plugin, the same as for the stack.
- Two DNS records that point at the host's public address: the application hostname, which becomes `PUBLIC_URL`, and the Keycloak hostname, which becomes `KEYCLOAK_URL`, unless the customer runs their own Keycloak. If the DNS provider offers a proxied mode, use DNS-only for the first setup, so the certificate challenge reaches the host directly.
- Ports 80 and 443 open from the internet to the host. The certificate challenge uses port 80. If port 80 cannot be opened, use the customer certificate path in "A host without internet access or port 80".
- An email address for certificate expiry notices.

## 1. Create the proxy network

The proxy and the stack meet on one Docker network with a fixed address range. The stack's generated `compose.yaml` attaches the application and Keycloak services to an external network named `proxy` under the aliases `<slug>-app` and `<slug>-keycloak`, so several customer stacks can share one host and one proxy without a name clash. Create the network once with a fixed subnet:

```sh
docker network create --subnet 172.30.0.0/24 proxy
```

Record the subnet. It is the value of `AUTH_TRUSTED_PROXIES` in the stack's `.env`, so the application trusts the forwarded client address only when the request comes from this network.

## 2. Create the Traefik folder

```sh
mkdir -p /opt/traefik/dynamic
touch /opt/traefik/acme.json
chmod 600 /opt/traefik/acme.json
```

If `acme.json` is not mode 600, Traefik refuses to start.

## 3. Write the static configuration

Create `/opt/traefik/traefik.yml`. Replace the email address. Keep the dashboard off.

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: ops@example.com
      storage: /acme.json
      httpChallenge:
        entryPoint: web

providers:
  file:
    directory: /dynamic
    watch: true

api:
  dashboard: false

log:
  level: INFO

accessLog: {}
```

If the DNS record is in a provider's proxied mode later, add the provider's address ranges under `entryPoints.websecure.forwardedHeaders.trustedIPs` and `entryPoints.web.forwardedHeaders.trustedIPs`, so the client address that the edge forwards is kept. Without that list Traefik records the edge's address as the client.

## 4. Write the routes

Create `/opt/traefik/dynamic/<slug>.yml`, one file per customer stack on the host. Replace the two hostnames and the slug. The service addresses are the stack's aliases on the `proxy` network, `<slug>-app` on `PORT` (default 3000) and `<slug>-keycloak` on 8080, never the bare service names, because every stack on the host names its services `app` and `keycloak`.

```yaml
http:
  routers:
    genie-ops-center:
      rule: "Host(`ops.example.com`)"
      entryPoints:
        - websecure
      service: genie-ops-center
      tls:
        certResolver: letsencrypt
    keycloak:
      rule: "Host(`id.example.com`)"
      entryPoints:
        - websecure
      service: keycloak
      tls:
        certResolver: letsencrypt

  services:
    genie-ops-center:
      loadBalancer:
        servers:
          - url: "http://acme-app:3000"
    keycloak:
      loadBalancer:
        servers:
          - url: "http://acme-keycloak:8080"
```

Do not add a `keycloak` router when the customer runs their own Keycloak. Point `KEYCLOAK_URL` at theirs instead.

No timeout or buffering setting is needed for the chat stream. Traefik flushes a streamed response at once and sets no limit on the time a response stays open, and the application writes a keepalive line every 20 seconds (`deployment.md`, "Before you start").

## 5. Write the Traefik compose file

Create `/opt/traefik/compose.yaml`.

```yaml
services:
  traefik:
    image: traefik:v3.6
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./traefik.yml:/traefik.yml:ro
      - ./dynamic:/dynamic:ro
      - ./acme.json:/acme.json
    command:
      - --configFile=/traefik.yml
    networks:
      - proxy

networks:
  proxy:
    external: true
```

Pin the image to the minor version you tested. Do not mount the Docker socket: the routes come from the file, so Traefik needs no access to the Docker API.

## 6. Start the proxy

```sh
cd /opt/traefik
docker compose up -d
docker compose logs -f traefik
```

Make sure that the log shows no error for the two hostnames. The first certificate arrives within a minute after the first HTTPS request for each hostname.

## 7. Connect the stack

In the stack's `.env`, set:

- `PUBLIC_URL=https://ops.example.com`
- `KEYCLOAK_URL=https://id.example.com`, or the customer's Keycloak address
- `AUTH_TRUSTED_PROXIES=172.30.0.0/24`, the subnet from step 1
- `KC_PROXY_TRUSTED_ADDRESSES`, the Traefik container's own address on the `proxy` network, for example `172.30.0.2`. Give Traefik a fixed address with `ipv4_address` under its `proxy` network in its compose file, and read it with `docker network inspect proxy`. Do not use the whole subnet, because every stack on the host shares it.

If `KC_PROXY_TRUSTED_ADDRESSES` is blank, Keycloak trusts `X-Forwarded-*` headers from every container on the `proxy` network, because `KC_PROXY_HEADERS=xforwarded` is set. On a host with several stacks, a container of another stack can then set the client address and the host name that Keycloak records and uses. Accept that risk only on a host that runs one stack. Port 8080 is never published, so a client outside the host cannot reach Keycloak without the proxy.

Start the stack as `deployment.md`, "Set up a new customer", step 6 says. The generated `compose.yaml` already joins the `proxy` network and publishes no port on the host, so the proxy is the only way in.

## 8. Verify

Run these from a machine outside the host.

```sh
curl -sI http://ops.example.com/ | head -1
curl -sI https://ops.example.com/api/health
curl -s https://ops.example.com/api/health
```

Make sure that the first command returns a 301 or 308 to HTTPS, that the second shows the security headers the application sets (`Strict-Transport-Security` among them), and that the third prints `ok`, or `degraded` before setup has run. Make sure that the certificate shown by the browser is issued to the hostname and not a Traefik default certificate; a default certificate means the challenge failed, and the Traefik log names the reason.

After the first sign-in, open the account page and make sure that the session's IP address is the person's address and not an address from the proxy subnet. If it is the proxy address, `AUTH_TRUSTED_PROXIES` does not match the network.

## 9. Renewal and upgrades

Traefik renews each certificate on its own about 30 days before expiry and needs no cron job. Back up `/opt/traefik/acme.json` with the stack's `.env`, or accept a new challenge after a restore. Upgrade Traefik by changing the image tag in its compose file and running `docker compose up -d` in `/opt/traefik`; the stack is not restarted.

## A host without internet access or port 80

Use the customer's own certificate. Remove `certificatesResolvers` from the static configuration, drop `certResolver` from each router but keep `tls: {}`, and add a `tls` section to the dynamic file that names the certificate and key files, mounted read-only into the container:

```yaml
tls:
  certificates:
    - certFile: /certs/ops.example.com.crt
      keyFile: /certs/ops.example.com.key
```

The customer's platform team renews the files. Traefik reloads them when they change.

## What any proxy must do

A customer who keeps their own proxy or load balancer applies these rules instead of the steps above.

- Terminate HTTPS for the application hostname and the Keycloak hostname, and redirect HTTP to HTTPS.
- Forward to the application container's `PORT` with the `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers set, and set `AUTH_TRUSTED_PROXIES` in `.env` to the proxy's address or range.
- Let a `text/event-stream` response stay open for hours, with an idle timeout above 20 seconds, and never buffer it.
- Allow request bodies up to `FILE_MAX_BYTES` plus a small margin, 16 MB by default, for uploads.
- Do not rewrite paths or add authentication in front of `/api/`; the application authenticates every request itself.

## Unverified claims

Confirm at the first customer setup:

1. The network aliases `<slug>-app` and `<slug>-keycloak` in the generated `compose.yaml` and its `proxy` network attachment, which the stack template of roadmap Section 1 item 6 produces (`../specs/01-deployment-and-setup.md`, R-28). The example above uses the slug `acme`.
2. The Traefik minor version to pin. The example names the line current on 2026-09-18.
3. That the application's `X-Forwarded-For` handling accepts a CIDR in `AUTH_TRUSTED_PROXIES`, as `../architecture/environment-contract.md` states.
