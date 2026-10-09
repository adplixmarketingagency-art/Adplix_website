# Adplix Employee Portal

Status: Worker and production D1 schema deployed; first Admin provisioned. Cloudflare Free adaptation routes password hashing to an internal SQLite-backed Durable Object, preserving existing hashes and D1 data. The full local quality gate passes, including real local Durable Object browser workflows; deployment/runtime verification and the Admin's private initial password rotation remain required. See the delivery guide for current evidence.

- [Complete requirements and implementation plan](SPECIFICATION.md)
- [Security hardening and portal security requirements](SECURITY.md)
- [Delivery, local preview and production setup](DELIVERY.md)
- [API integration contract](API-CONTRACT.md)
- [Portal UI direction](DESIGN.md)

The public website remains the existing Vite site. Desktop/mobile navigation links to `/portal/`. Real login requires a migrated D1 database and an operator-provisioned Admin. Users can request Employee registration, but have no access until Admin approves. There is no public Admin signup or built-in production account.

This folder contains project documentation, not employee records, personal emails, passwords, or private configuration. Never put real credentials in these documents.
