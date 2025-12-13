# Crop Dashboard Platform

A full-stack enterprise platform for serving a data dashboard to multiple users with proper access control. React frontend, FastAPI backend, encrypted SQLite database.

The dashboard and data pipeline it wraps were created by the [Crop Sensing Group](https://github.com/crop-sensing) at UC Davis - specifically [Audrey Petrosian](https://github.com/ucpetrosian) and [Mina Swintek](https://github.com/mswintek). Their [original repo](https://github.com/crop-sensing/crop-dashboard) handles the agricultural sensor data processing and visualization. This platform provides the infrastructure to serve that dashboard to many stakeholders with authentication, permissions, and admin controls.

This documentation focuses on the platform layer - the enterprise wrapper. The dashboard content itself is theirs to maintain or swap out.

---

## The platform

Core infrastructure:

- **Authentication** - JWT-based login with httpOnly cookies, session management
- **Role-based access control** - Admin vs user roles, group-based data permissions
- **Admin panel** - User management, group management, site configuration, system settings
- **Database layer** - SQLAlchemy ORM with SQLCipher encryption at rest
- **Box integration** - Cloud storage sync for automated file ingestion
- **Multi-user architecture** - Concurrent users with isolated data access

The domain-specific pieces (sensor data, CSI dataloggers, agricultural metrics) comes from the Crop Sensing Group's work. What's reusable here is the plumbing: auth, RBAC, encrypted database, file uploads, cloud sync, admin panel. That infrastructure could wrap any dashboard or data application.

---

## The stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Vite, TailwindCSS |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| Database | SQLite + SQLCipher |
| Auth | JWT tokens (httpOnly cookies) |

This stack is straightforward to understand and deploy. No separate database server to manage, no complex infrastructure. SQLite handles concurrent reads well, so serving many users viewing dashboards isn't a problem - it's write contention that becomes the bottleneck at scale. For a read-heavy application like this, it works well.

---

## Where to start

| If you want to... | Start here |
|-------------------|------------|
| Get it running locally | [Quick Start](getting-started/quick-start.md) |
| Understand the architecture | [Stack Overview](the-stack/overview.md) |
| See why specific choices were made | [Decisions](how-i-built-this/decisions.md) |
| Add a feature | [Adding Features](making-it-yours/adding-features.md) |
| Strip it down for a new project | [Starting Fresh](making-it-yours/starting-fresh.md) |
| Look up a term | [Glossary](glossary.md) |

---

## About these docs

This documentation won't be covering the basics of Python, JavaScript, or SQL - things like what a function is or how HTTP works. Online resources will do a far better job teaching those fundamentals than I can here.

What these docs focus on is how the pieces of this platform connect, why certain decisions were made, and where to look when you want to change something. When the docs reference the dashboard visualization or domain-specific data interpretation, that's the Crop Sensing Group's work - noted when relevant.
