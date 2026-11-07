# Isolated large-file acceptance results

Evidence: **not-run**

| Scenario | Status | Reason |
| --- | --- | --- |
| isolated-provider-preflight | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| upload-100MiB | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| upload-1GiB | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| upload-10GiB | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| interruption-same-session | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| shared-process-restart-resume | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| lost-create-ack | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| lost-part-ack-retry | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| lost-complete-ack-duplicate-completion | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| cancel-abort | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| expiration-cleanup-clock-advanced | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| concurrent-files | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| no-partial-publication | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| final-provider-cleanup | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| resource-budgets | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| proxy-request-path | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| proxy-slow-part-timeout | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| production-resource-retention-gates | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| download-interruption-range-integrity | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| download-stale-if-range | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| concurrent-downloads | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| browser-native-durable-recovery | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| real-platform-logout-revocation | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| storage-unavailability | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |
| provider-cpu-disk-throughput | BLOCKED | NO_ISOLATED_PROVIDER_CONFIG |

No production configuration or application feature flag was changed.

```json
null
```
