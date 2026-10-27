# Nexora UI Foundation

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

Foundation, App Layout และหน้า workspace ใช้ design system นี้แล้ว. Nexora เชื่อม authentication, D1-backed session, File Browser/Trash operations, Favorites, Recent และ Dashboard ผ่าน same-origin API/StorageProvider; Shared ยังคงใช้ demo/fixture state.

ก่อนจบแต่ละ phase ให้รัน lint/build ตามขอบเขต และตรวจ browser จริง: Dark/Light/System, desktop/mobile, keyboard, dialog/menu และ console errors

## Phase 3 — Layout และ Button

- `src/layouts/AppLayout.jsx` ครอบ `Outlet` ด้วย AppShell เดียว Sidebar state จึงอยู่ต่อระหว่างเปลี่ยน route
- Sidebar desktop เต็มความสูงชิดขอบซ้าย; โหมด collapsed กว้าง 60px และ expanded กว้าง 224px ตั้งแต่ `md`, 240px ที่ `lg`, และ 256px ที่ `2xl`; AppShell กันพื้นที่ด้านซ้ายตามความกว้าง Sidebar เพื่อไม่ให้บัง content
- บน mobile ใช้ drawer เต็มความสูงที่เปิดจาก Header; desktop Sidebar คงอยู่ขณะเปลี่ยน route ส่วน Header sticky อยู่ในพื้นที่ content
- `src/components/navigation/navigation.js` เป็นแหล่งข้อมูลร่วมของเมนู ชื่อหน้า และคำอธิบาย
- Dashboard ใช้ active mount, reported usage และ Recent จริงโดยไม่มี fixture metrics; Recent ใช้ authenticated API/D1 พร้อม metadata hydration, refresh/retry และ actions ที่ใช้ flow เดิม. Favorites โหลดรายการจริงจาก authenticated API/D1 และ storage mount ที่เป็นเจ้าของ object; Trash โหลดข้อมูลจาก active storage ด้วย cursor pagination พร้อม Restore และ Permanent Delete. Shared ใช้ fixture records, Storage แสดงสถานะการเชื่อมต่อ และ Settings ใช้ตั้งค่าธีมได้ URL ที่ไม่พบแสดง 404
- Mobile navigation ใช้ Base UI Dialog: focus trap, Escape, คืน focus และปิดเมื่อเลือกเมนูหรือเปลี่ยนเป็น desktop breakpoint
- `Button` กลางยังใช้ Base UI และ variants เดิม โดยใช้ `src/utils/glass.js` และ `.glass-interactive` ร่วมกับ navigation
- Interaction อ้างอิง IssueDesk GlassButton: diagonal sheen, radial light ตามเมาส์, inset rim/shadow และ active scale 0.97; sheen, pointer light และ rim ของปุ่มใช้สีตัวอักษร จึงมองเห็นได้บนพื้นปุ่มทั้งสว่างและมืด ส่วนปุ่ม filled/destructive คงสีเพื่อรักษา contrast
- Pointer tracking ไม่ทำงานกับ touch/disabled และไม่ใช้ React state ต่อการขยับเมาส์ Caller ยังส่ง `onPointerMove`, `ref`, `render` และ className callback ผ่าน Button ได้
- ปุ่มตกแต่ง Search/Notifications เดิมใน Header ถูกแทนด้วยชื่อหน้าและคำอธิบาย ปุ่ม file search ใน toolbar ยังอยู่ตาม implementation เดิม
- `FilesProvider` เก็บ fixture files ของ Shared ข้าม routeในหน่วยความจำ; ข้อมูล demo รีเซ็ตเมื่อ refresh. Dashboard/Recent ใช้ remote Recent API; Favorites ใช้ state จาก Nexora D1/API และล้าง reference เมื่อ object ถูกลบจาก storage. Upload queue ของ demo จำลอง progress และไม่ส่งข้อมูลไป Storage Service. Trash ใช้ remote state แยกตาม storage mount และไม่ fallback เป็น fixture
- File Browser มี responsive list/grid, search/sort, context actions, selection, dialogs, sample empty states และ on-demand connected preview. Selection toolbar เปิด actions เฉพาะเมื่อเลือก object เดียว; row และ toolbar ใช้ operation path เดียวสำหรับ Favorite, Copy, Move, Preview และ Move to Trash. ปุ่มรูปดาวมี accessible active state และ touch target อย่างน้อย 44px
- Connected File Browser uses a separate on-demand preview dialog for allowlisted images, PDF, and text. Text and JSON render as escaped source text, PDFs use a sandboxed frame, and preview loading/error/size states appear inline. Preview bytes are fetched only when requested; no preview bytes enter the listing cache.
- Shared, provider usage และ permissions ยังไม่ใช่ข้อมูลหรือ operations จริง ปุ่ม Share ถูกปิดจนกว่าจะมี API ที่ผ่านการทบทวน
- Phase 9.3.2 verified safe on-demand previews and exact breadcrumb navigation; Phase 9.4 adds connected Trash/Restore/Permanent Delete with capability checks, confirmation, cursor pagination and targeted cache updates. Phase 9.4.1 connects selection toolbar actions and Favorites. Current local checks and browser limitations are recorded in `PROJECT_HANDOFF.md` and phase reports.
