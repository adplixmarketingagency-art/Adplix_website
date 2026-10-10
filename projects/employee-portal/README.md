# Adplix Employee Portal

Status: Cloudflare Free adaptation deployed and working, as confirmed by the owner after successful password rotation and additional Admin creation. The Admin in-time follow-up tracks first login and duration for both roles in Analytics and Excel; the full local quality gate passes 124 tests and both browser suites. See the delivery guide for release evidence and recording semantics.

- [Complete requirements and implementation plan](SPECIFICATION.md)
- [Security hardening and portal security requirements](SECURITY.md)
- [Delivery, local preview and production setup](DELIVERY.md)
- [API integration contract](API-CONTRACT.md)
- [Portal UI direction](DESIGN.md)

The public website remains the existing Vite site. Desktop/mobile navigation links to `/portal/`. Real login requires a migrated D1 database and an operator-provisioned Admin. Users can request Employee registration, but have no access until Admin approves. There is no public Admin signup or built-in production account.

This folder contains project documentation, not employee records, personal emails, passwords, or private configuration. Never put real credentials in these documents.
