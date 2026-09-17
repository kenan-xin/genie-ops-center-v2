# Module: Approvals

Kind: customer module, first customer. Status: DEFERRED on customer discovery (`discovery.md`, D-11 and D-12). Starts after the contracts module and after discovery closes.

## Who it is for

People who request an approval, the approvers in the chain, and the administrators who define templates and hierarchies.

## Problem

Approvals run in a 2017 e-sign system the customer intends to shut down after moving.

## Provisional shape

Request, template, approval chain with ordered steps, step state, comments, attachment (referencing core `file`), and a full history. The workflow engine is designed only when this module starts; the core must not build one earlier.

## Permissions and roles `provisional`

DEFERRED (D-11 and D-12). Expected keys, for room in the design only: `approvals:request`, `approvals:approve`, `approvals:admin`.

## Tables `provisional`

DEFERRED (D-11 and D-12). Expected, for room in the design only: `approval_template`, `approval_request`, `approval_step`, `approval_action`, `approval_attachment`.

## Open decisions

None recorded until discovery closes.
