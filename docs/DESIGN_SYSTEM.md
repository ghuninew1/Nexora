# Nexora UI Foundation

The Header account control opens the account page and remains accessible by keyboard and on mobile.

User management is linked from admin Settings and uses responsive rows, shared controls and a confirmation dialog for deletion.

Settings แสดง maintenance control เฉพาะ admin พร้อม dialog ยืนยันและข้อความสถานะพื้นหลังสีเหลืองจัดกึ่งกลางด้านบนของ workspace; server เป็นผู้บังคับสิทธิ์การเปลี่ยนข้อมูล

Nexora ใช้ React, Tailwind CSS v4 และ Base UI/shadcn components เดิม โดยยึด Liquid Glass ของ IssueDesk เป็น reference ด้านภาพ ไม่ใช้ business logic หรือสิทธิ์ของ IssueDesk

## Theme และ tokens

- `src/index.css` เป็นแหล่งหลักของ semantic colors, radius และ glass tokens
- ค่าเริ่มต้นเป็น Dark; รองรับ Light และ System ผ่าน `src/hooks/useTheme.js`
- `index.html` ใช้ key `theme` เดียวกันเพื่อกำหนด theme ก่อน React render
- Theme hook กระจายการเปลี่ยนในหน้าเดียวกันและรับ storage events จาก tab อื่น รวมถึงการเปลี่ยน OS theme ในโหมด System
- หากเขียน localStorage ไม่สำเร็จ ตัวเลือกยังใช้ได้ใน session ปัจจุบัน

## Glass surfaces

| Class | ใช้กับ |
| --- | --- |
| `glass-surface` | Surface หลัก มี border, radius และ shadow |
| `glass-header` / `glass-sidebar` | Layout chrome มี highlight ที่เบากว่า surface หลัก |
| `glass-popover` | Dialog และ dropdown ใช้พื้นผิวทึบกว่าเพื่อให้อ่านได้ |
| `glass-control` | Outline button; ใช้ highlight/shadow โดยไม่เพิ่ม blur ทุกปุ่ม |
| `glass-input` | Input surface และ focus background |
| `glass-nav-active` | Active navigation surface |
| `glass-table` | Container ตาราง; rows ใช้ hover เบา ๆ |
| `glass-overlay` | Dialog backdrop |

Surface มี opaque fallback หาก browser ไม่รองรับ backdrop filter และรองรับ reduced transparency เมื่อ browser ตรวจ media query นี้ได้ Animation/transition เคารพ reduced motion

อย่าเพิ่ม glass ทุก row หรือ override `bg-card` ทั่วแอป ใช้ semantic tokens และ component variants เพื่อรักษาลำดับชั้นของข้อมูล

## Components และ classes

ใช้ Button, Input, Dialog และ DropdownMenu ใน `src/components/ui/` ต่อไป ปรับ visual variants ที่ primitive ก่อนเพิ่ม style ซ้ำในหน้า

JSX ที่สร้างหรือแก้ต้องใช้ `cx()` สำหรับ `className` โดยส่ง string หรือ falsy value เท่านั้น Helper ไม่ merge Tailwind conflicts จึงต้องหลีกเลี่ยง utility ที่ขัดกัน

`components.json` ชี้ utility ไป `@/utils/cx` มี export `cn` เป็น compatibility alias สำหรับ shadcn generator; เมื่อเพิ่ม component ให้ตรวจและเปลี่ยน application JSX ให้เรียก `cx()` ตาม convention

## สถานะของ UI foundation

Foundation, App Layout และหน้า workspace ใช้ design system นี้แล้ว. Nexora เชื่อม authentication, D1-backed session, File Browser/Trash operations, Favorites, Recent และ Dashboard ผ่าน same-origin API/StorageProvider; Shared ใช้ persistent public links ผ่าน Nexora API/D1 ใน Phase 9.6.

ก่อนจบแต่ละ phase ให้รัน lint/build ตามขอบเขต และตรวจ browser จริง: Dark/Light/System, desktop/mobile, keyboard, dialog/menu และ console errors

## Phase 3 — Layout และ Button

- `src/layouts/AppLayout.jsx` ครอบ `Outlet` ด้วย AppShell เดียว Sidebar state จึงอยู่ต่อระหว่างเปลี่ยน route
- Sidebar desktop เริ่มใต้ Header และชิดขอบซ้าย; โหมด collapsed กว้าง 60px และ expanded กว้าง 224px ตั้งแต่ `md`, 240px ที่ `lg`, และ 256px ที่ `2xl`; AppShell กันพื้นที่ด้านซ้ายตามความกว้าง Sidebar เพื่อไม่ให้บัง content
- บน mobile ใช้ drawer เต็มความสูงที่เปิดจาก Header; desktop Sidebar คงอยู่ขณะเปลี่ยน route ส่วน Header sticky กว้างเต็มหน้าจอ
- `src/components/navigation/navigation.js` เป็นแหล่งข้อมูลร่วมของเมนู ชื่อหน้า และคำอธิบาย
- Dashboard ใช้ active mount, reported usage และ Recent จริงโดยไม่มี fixture metrics; Recent ใช้ authenticated API/D1 พร้อม metadata hydration, refresh/retry และ actions ที่ใช้ flow เดิม. Favorites โหลดรายการจริงจาก authenticated API/D1 และ storage mount ที่เป็นเจ้าของ object; Trash โหลดข้อมูลจาก active storage ด้วย cursor pagination พร้อม Restore และ Permanent Delete. Shared จัดการ public links จริง, Storage แสดงสถานะการเชื่อมต่อ และ Settings ใช้ตั้งค่าธีมได้ URL ที่ไม่พบแสดง 404
- Mobile navigation ใช้ Base UI Dialog: focus trap, Escape, คืน focus และปิดเมื่อเลือกเมนูหรือเปลี่ยนเป็น desktop breakpoint
- `Button` กลางยังใช้ Base UI, variants เดิม และ `.glass-interactive`; NavLink ใน Sidebar ใช้ Liquid Glass hover เช่นเดียวกับปุ่ม Collapse และแสดงสถานะ active แยกกัน
- Interaction อ้างอิง IssueDesk GlassButton: diagonal sheen, radial light ตามเมาส์, inset rim/shadow และ active scale 0.97; sheen, pointer light และ rim ของปุ่มใช้สีตัวอักษร จึงมองเห็นได้บนพื้นปุ่มทั้งสว่างและมืด ส่วนปุ่ม filled/destructive คงสีเพื่อรักษา contrast
- Pointer tracking ไม่ทำงานกับ touch/disabled และไม่ใช้ React state ต่อการขยับเมาส์ Caller ยังส่ง `onPointerMove`, `ref`, `render` และ className callback ผ่าน Button ได้
- ปุ่มตกแต่ง Search/Notifications เดิมใน Header ถูกแทนด้วยชื่อหน้าและคำอธิบาย ปุ่ม file search ใน toolbar ยังอยู่ตาม implementation เดิม
- `FilesProvider` ยังมี legacy fixture helpers; Shared ใช้ `SharesProvider` และ D1 โดยแยกจาก listing cache; ข้อมูล demo รีเซ็ตเมื่อ refresh. Dashboard/Recent ใช้ remote Recent API; Favorites ใช้ state จาก Nexora D1/API และล้าง reference เมื่อ object ถูกลบจาก storage. Upload Queue ที่เชื่อมต่อใช้ progress แบบ indeterminate สำหรับ legacy และ server-acknowledged bytes/parts สำหรับ multipart ที่มี capability; ไม่ใช้ fixture progress แทนข้อมูลจริง. Trash ใช้ remote state แยกตาม storage mount และไม่ fallback เป็น fixture
- คิวอัปโหลดล้างรายการที่สำเร็จหลัง 5 วินาที โดยคงรายการที่ผิดพลาดหรือยกเลิกไว้ให้ผู้ใช้ตรวจสอบ
- หน้าต่าง Copy/Move มีปุ่มสร้างโฟลเดอร์ด้านล่างซ้ายในแถวเดียวกับ Cancel เมื่อ storage อนุญาต
- File Browser ใช้ไอคอนแยกสำหรับไฟล์รูปภาพ วิดีโอ ข้อความ และ PDF ทั้งใน list/grid และใช้ไอคอนทั่วไปสำหรับไฟล์อื่น
- File Browser list ใช้แถวสูงอย่างน้อย 52px และหัวตารางแบบกระชับ โดยคงปุ่ม Favorites ขนาดอย่างน้อย 44px
- File Browser มี responsive list/grid, search/sort, context actions, selection, dialogs, sample empty states และ on-demand connected preview. Selection toolbar เปิด actions เฉพาะเมื่อเลือก object เดียว; row และ toolbar ใช้ operation path เดียวสำหรับ Favorite, Copy, Move, Preview และ Move to Trash. ปุ่มรูปดาวมี accessible active state และ touch target อย่างน้อย 44px
- File Browser selection controls use a visible border and primary-colored hover indication in list and grid views; the grid Select all button uses contrasting primary colors on hover.
- Connected File Browser uses a separate on-demand preview dialog for allowlisted images, PDF, and text. Text and JSON render as escaped source text, PDFs use a sandboxed frame, and preview loading/error/size states appear inline. Preview bytes are fetched only when requested; no preview bytes enter the listing cache.
- Share เป็น View + Download เท่านั้น; dialog รองรับ Create/Copy/Open/Replace/Revoke. หลัง refresh ไม่สามารถกู้ secret เดิม ให้ยืนยัน Replace link. Provider usage แสดงเฉพาะเมื่อ API รายงานจริง; ไม่มี permission editor หรือ account-to-account sharing.
- Phase 9.3.2 verified safe on-demand previews and exact breadcrumb navigation; Phase 9.4 adds connected Trash/Restore/Permanent Delete with capability checks, confirmation, cursor pagination and targeted cache updates. Phase 9.4.1 connects selection toolbar actions and Favorites. Current local checks and browser limitations are recorded in `PROJECT_HANDOFF.md` and phase reports.


Phase 9.6 public layout uses the Nexora logo, shared surface/Button/Dialog, root-scoped wrapping breadcrumbs, safe long-name wrapping and 44px primary public controls. Public route has no workspace navigation or owner identity. Local mock browser QA covered desktop and 390 × 844; live provider/image/PDF QA remains pending. See `PHASE_9_6.md`.

- Storage Overview ใช้ glass cards แบบ mobile-first สำหรับจำนวน assigned storages และสถานะ Connected / Unavailable / Unknown โดยแยกข้อความ usage unavailable ออกจากสถานะการเชื่อมต่อ; จำนวน storage ไม่ใช่จำนวน project และไม่มีการแสดงยอด aggregate ที่ยังไม่รองรับ

- Multipart Upload Queue ใช้ shared Button และ action targets อย่างน้อย44px; แสดง Verifying/Finalizing/Pause/Resume/Cancel แยกสถานะ โดยไม่แสดง100% ก่อน server ยืนยัน completion ไฟล์ legacy ไม่มี Pause/Resume และยังใช้ indeterminate progress.

- Durable multipart recovery เพิ่มสถานะ Checking server/Waiting for original file/File mismatch และปุ่ม Select original file/Retry reconciliation/Clear local history ภายใน Upload Queue เดิม ปุ่มใช้ shared Button และ44px targets พร้อม wrap บนมือถือ; เลือกไฟล์แล้วต้องกด Resume เอง และการล้าง history ไม่ cancel server session.


### Upload Queue coordination states

Phase4.4 retains the existing responsive Upload Queue. Multipart rows distinguish Waiting for network, Recovering connection, Active in another tab and Waiting for ownership, with Resume available and Retry connection actions. Use the existing shared Buttons, theme tokens, 44px controls, wrapping row layout and server-acknowledged progress semantics. An unavailable locking authority must be visible and block active multipart work. Ownership waiting is not represented as transmitted bytes.


## Global Transfer Manager

The Header Transfers control opens one responsive, scrollable Base UI dialog with focus trapping, Escape dismissal and focus return. Reuse UploadQueue, shared Buttons, glass surfaces, cx and theme tokens; retain44px row actions and mobile wrapping. The count and attention indicator cover uploads only, including paused/recovery entries. Multipart progress caps99% until server confirmation; legacy uploads remain indeterminate. Upload speed/ETA use measured server acknowledgements. Queue ownership remains independent of the dialog lifetime.

Downloads are native browser downloads. Do not show a Downloads section, queue row, concurrency selector, Save As picker, progress/speed/ETA or recovery actions in the application. Existing File Browser operation feedback may say "Download requested. Check your browser downloads." This indicates initiation, never verified completion. Each action uses the authenticated endpoint independently; browser restrictions may require permission. File previews keep their separate bounded on-demand rendering.

### Transfer admission feedback

The Upload Queue retains at most50 tasks including finished/recovered entries. An overflowing selection is rejected as a whole before retaining files or starting requests. Reuse the existing File Browser operation alert to explain the limit and Clear finished/smaller-selection actions; never silently queue a subset or replace an active task. Native download concurrency and history belong to the browser, with no application queue bound. See the transfer production-readiness guide for verified browser and infrastructure boundaries.
