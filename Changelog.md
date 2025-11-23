# Changelog

## [0.1.4] - 2025-11-23
- Fix script parse error caused by an escaped slash in the API base URL normalization.

## [0.1.3] - 2025-11-23
- Ensure UI enables even if config fetch misbehaves by moving button enabling to a guaranteed path.

## [0.1.2] - 2025-11-23
- Prevent config load hangs with timeout, clearer status messaging, and fallback activation.

## [0.1.1] - 2025-11-23
- Make config loading resilient with cache-busting fetch and fallback messaging to guide serving `config.json`.

## [0.1.0] - 2025-11-23
- Crafted Schildcafe single-page experience powered by Servitør API without frameworks.
- Load API base URL and menu items from `config.json` to drive UI state.
- Implemented multi-product order submission, status tracking, retrieval, and kitchen board refresh.
