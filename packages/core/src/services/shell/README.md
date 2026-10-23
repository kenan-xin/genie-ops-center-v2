# packages/core/src/services/shell

The signed-in shell's server model.

## What belongs here

The per-request shell model: the navigation tree mapped to browser links, the chrome switch, the identity block with its mark link, the support contact and the Change password URL, all read through the `TenantContext` readers and one navigation tree pass.

## What must not go here

A permission check, a scope filter or a landing rule of its own: the navigation tree already decided those. React components, which live in `features/shell`. Catalogue copy: labels arrive as arguments. A permission key in anything the browser receives.
