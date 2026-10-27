# Nexora — Phase 9.3.1: File Browser Performance & Caching

อัปเดต: 2026-10-27

## สถานะ

เพิ่ม in-memory listing cache, stale-while-revalidate, request deduplication, breadcrumb metadata cache และ selective invalidation ใน frontend โดยไม่เปลี่ยน Nexora API หรือ Shared Storage contract. ผู้ใช้รายงานว่า Phase 9.2/9.3 และ operation Upload, Download, Rename, Move, Copy ผ่าน production แล้ว และ Copy ได้รับการแก้ไข/ยืนยันแล้ว; งานรอบนี้ไม่ได้เชื่อม production หรือ deploy.

## ตรวจ request path ก่อนปรับ

`useRemoteFilesState` เรียก `listStorageObjects` → `GET /api/storage/v1/storages/:storageId/objects` ด้วย same-origin credentials → Pages Function ตรวจ session/ownership แล้วเรียก Shared Storage → normalize เฉพาะ public object fields → Promise กลับเข้า hook → `setBrowserState` ทำให้ React commit. Frontend เห็นเวลา end-to-end ของ request ได้ แต่ไม่สามารถแยกเวลาของ Pages Function กับ Shared Storage ได้หากไม่มี server timing หรือการตรวจ DevTools/diagnostics ฝั่ง server.

ก่อนเปลี่ยน ไม่มี folder cache หรือ in-flight deduplication; การเปิด folder เรียกหน้าแรกอีกครั้ง และการเปลี่ยน route ยกเลิก request เก่าก่อนรับผลไว้ใช้ภายหลัง. แต่ละครั้งที่เปิด route มี call site เดียว; ไม่พบการเรียกซ้ำจากหลาย consumers ใน File Browser. Strict Mode cleanup สามารถยกเลิก scheduled effect ก่อนส่ง request. ไม่มี production latency baseline หรือ Network capture ในงานนี้ จึงไม่อ้างตัวเลขก่อน/หลัง.

มี development-only `[nexora:file-list]` console diagnostic แสดงเวลา request รวมและ response-to-React-commit, จำนวนรายการ และ first-page flag. ไม่มี storage/folder ID หรือข้อมูล upstream ใน log. Timing เป็น browser-to-Nexora end-to-end; ใช้ browser Network panel และ safe server diagnostics เพิ่มเติมเพื่อแยก upstream latency. Production ไม่มี telemetry เพิ่ม.

## Cache design

- Owner: `RemoteFilesCache` ที่สร้างหนึ่ง instance ภายใน `useRemoteFilesState` ซึ่งอยู่ใต้ `FilesProvider`; อายุ cache จึงผูกกับ authenticated app session/tab.
- Key: JSON tuple `[storageId, parentId-or-root-sentinel]`; page request เพิ่ม cursor เป็น key component. Root ใช้ sentinel คงที่ภายใน cache. Mount คนละอันไม่แชร์ listing หรือ metadata.
- Entry: public normalized `objects`, loaded cursor pages, `nextCursor` ของหน้าสุดท้าย และ `fetchedAt`. ไม่เก็บ provider refs, storage project IDs, bucket, credentials, URLs หรือ binary.
- TTL: `FOLDER_LIST_CACHE_TTL_MS = 20_000`. เป็นค่าเดียวใน cache module; สั้นพอให้ข้อมูลกลับมาสดใหม่หลังการใช้งานทั่วไป ขณะที่กลับไปโฟลเดอร์เดิมได้ทันที.
- Capacity: สูงสุด 60 listing entries; Map insertion order ทำ LRU โดย `get` ย้าย entry ไปท้ายสุด. Metadata จำกัด 600 objects ต่อ storage. ไม่มี file bytes.
- Cache storage scope ถูกล้างเมื่อ logout/session expiration, เปลี่ยนผู้ใช้, เปลี่ยน storage mount และ unmount ของ FilesProvider. Cache key ยังรวม storage ID เป็น defense in depth.

## Read / request behavior

- Cache miss: แสดง loading ตามเดิมและดึงหน้าแรก.
- Fresh hit: render รายการและ cursor ทันทีโดยไม่ส่ง listing request.
- Stale hit: render cached rows ทันที แล้ว revalidate หน้าแรกแบบ background; เปลี่ยนรายการเมื่อมีผล authoritative. เมื่อ revalidate ล้มเหลวเก็บ cached rows, แสดงข้อความสุภาพพร้อมปุ่ม Refresh; ไม่มี cached data ใช้ error state เดิม.
- Manual refresh และ retry บังคับ request ผ่าน TTL. Retry ที่มี cache คงข้อมูลไว้ระหว่าง request.
- Request dedupe: key เป็น storage + parent/root + cursor; concurrent caller ใช้ Promise เดียวกัน. Cursor ต่างกันไม่รวม request.
- Request ที่เริ่มใน folder A ทำงานต่อหลังนำทางไป B เพื่อเติม cache; generation guard ป้องกันผล A แทน UI ของ B. Cache epoch aborts request เมื่อ clear ตอน auth/storage context เปลี่ยน และผลล่าช้าจะไม่เติม cache.
- React first-page request timing และ commit timing แสดงเฉพาะ development; ไม่เพิ่ม production telemetry.

## Pagination policy

Cache เก็บ page boundaries และ cursor ของแต่ละหน้า. Load More ต่อเมื่อ cursor ตรงกับ `nextCursor` ปัจจุบันและ merge/dedupe ด้วย logical `objectId`. เมื่อ revalidate หน้าแรก จะรักษาหน้าถัดไปที่โหลดไว้เฉพาะกรณี cursor ของหน้าแรกยังเหมือนเดิม; ถ้าเปลี่ยน จะทิ้ง continuation pages เพื่อไม่ใช้ cursor chain เก่า. นโยบายนี้เลือก cursor correctness เหนือการเก็บรายการเก่าทั้งหมด.

## Breadcrumb metadata

เก็บเฉพาะ `objectId → {name,parentId,type}` ที่ได้จาก public listing/mutation response, แยกตาม storage. เมื่อ route history state ไม่มี breadcrumb แต่ metadata chain ครบ สามารถประกอบ path ที่รู้จักได้; ถ้า metadata หาย/ไม่ครบ/เกิด cycle จะใช้ safe root fallback เดิม. API 404 ของ folder ยังคงกลับ root. Rename อัปเดตชื่อ metadata และ route-state breadcrumb; Move อัปเดต parent metadata จาก response. Metadata ไม่ถือเป็น authorization หรือ folder existence proof.

## Invalidation and mutation behavior

| Operation | Cache affected | Visible behavior |
| --- | --- | --- |
| Create folder | destination/current parent | Invalidate parent; force refresh |
| Upload | upload destination only | Invalidate destination; coalesce active destination refreshes with 120 ms debounce |
| Rename | object's current parent; renamed object's metadata | Invalidate parent; refresh when visible; apply returned public object metadata |
| Move | source parent + destination parent; moved object's metadata | Invalidate both; refresh visible affected folder; apply returned parent metadata |
| Copy | destination parent; new object's metadata | Invalidate destination; refresh when visible; apply returned public object metadata |

Upload concurrency remains 2. Upload completions in a short burst cancel/replace one pending destination refresh timer; unrelated folder entries remain intact. Mutation responses are only used for public object metadata; no synthetic listing row is created. Listing refresh remains authoritative.

## Validation

- Added Node tests for miss/cache storage, freshness expiry, mount-scoped root/object keys, in-flight dedupe by cursor, pagination anchor behavior, safe breadcrumb reconstruction, invalidation, clear/late request isolation, and bounded LRU.
- `pnpm lint`: passed on 2026-10-27 with no warnings.
- `pnpm test`: 81/81 passed on 2026-10-27.
- `pnpm build`: passed on 2026-10-27.
- `git diff --check`: passed on 2026-10-27.
- Local Vite opened at `http://127.0.0.1:5173`; `/files` rendered the existing “Can’t verify your session” state because the local auth API is unavailable. File Browser interaction, Network panel, 390 × 844 layout, authenticated mount and production latency were not verified. Use the production QA sequence below before release.

## Production / browser QA checklist

1. In browser Network, visit an uncached root/folder: expect one first-page listing request.
2. Return to a fresh cached folder: expect immediate rows and no listing request.
3. Wait over 20 seconds, revisit: expect immediate cached rows plus one background request.
4. Use Refresh and Retry: each must issue an authoritative request despite TTL.
5. Load more, revisit, and revalidate: same first cursor retains loaded pages; changed cursor resets continuation. Confirm duplicate IDs do not appear.
6. Verify API status/timing and React commit diagnostic in development; use only safe server diagnostics to assess upstream stage.
7. Exercise upload burst, rename, move and copy; verify only listed affected folder caches refresh.
8. Rapidly switch folders and use browser back/forward; late response must never replace current folder UI.
9. Test logout/session expiry and mount/user switch; old results must not reappear.
10. Check keyboard navigation and 390 × 844 layout with a connected test mount.

## Known limitations

- No numeric before/after production latency comparison: production account was not contacted. The browser diagnostic measures browser request-to-response and React commit, not internal Pages vs Shared Storage spans.
- Cache is session/tab memory only and resets on reload; entries are metadata only.
- Search/sort still apply to loaded pages. This change does not add server-side search, preview, Trash, share, offline persistence, or prefetch.
- FolderDestinationDialog continues its independent lazy listing behavior and does not share the main browser cache.
- Production smoke results for Phase 9.3 are user-reported context, not independently revalidated here.
