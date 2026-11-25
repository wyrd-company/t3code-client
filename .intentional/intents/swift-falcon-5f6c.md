---
t3code-lib: patch
---

On stock 0.1.12, handle checkout changes refused while a thread has an active run in the checkout. Finish or stop the run before retrying. A review preview's `sourceKind` must agree with the file's `sourceKind`, and pull request diff reads accept only commits listed on the change request. Reauthenticate if the server refuses a pending exchange after sessions were revoked. Scheduled-task webhook verification and delivery records omit the `Cookie` header.
