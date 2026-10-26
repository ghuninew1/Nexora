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

## ขอบเขต Phase 2

Foundation นี้ยังไม่ย้าย App Layout, Sidebar หรือ File Browser ไปใช้ glass classes ทั้งหมด งานนั้นเป็น Phase 3–4 และยังไม่เชื่อม authentication, Storage API หรือ database

ก่อนจบแต่ละ phase ให้รัน lint/build ตามขอบเขต และตรวจ browser จริง: Dark/Light/System, desktop/mobile, keyboard, dialog/menu และ console errors

## Phase 3 — Layout และ Button

- `src/layouts/AppLayout.jsx` ครอบ `Outlet` ด้วย AppShell เดียว Sidebar state จึงอยู่ต่อระหว่างเปลี่ยน route
- Sidebar desktop ใช้ floating rail ขนาด 60px / 240px ตามแนว IssueDesk ส่วน Header เป็น sticky ที่มองเห็นเสมอเพื่อเข้าถึงเครื่องมือจัดการไฟล์
- `src/components/navigation/navigation.js` เป็นแหล่งข้อมูลร่วมของเมนู ชื่อหน้า และคำอธิบาย
- Dashboard, Recent, Favorites, Shared, Trash, Storage และ Settings มี route พร้อมสถานะ Coming next ฟังก์ชันจริงอยู่ใน Phase 5; URL ที่ไม่พบแสดง 404
- Mobile navigation ใช้ Base UI Dialog: focus trap, Escape, คืน focus และปิดเมื่อเลือกเมนูหรือเปลี่ยนเป็น desktop breakpoint
- `Button` กลางยังใช้ Base UI และ variants เดิม โดยใช้ `src/utils/glass.js` และ `.glass-interactive` ร่วมกับ navigation
- Interaction อ้างอิง IssueDesk GlassButton: diagonal sheen, radial light ตามเมาส์, inset rim/shadow และ active scale 0.97 ปุ่ม filled/destructive คงสีเพื่อรักษา contrast
- Pointer tracking ไม่ทำงานกับ touch/disabled และไม่ใช้ React state ต่อการขยับเมาส์ Caller ยังส่ง `onPointerMove`, `ref`, `render` และ className callback ผ่าน Button ได้
- ปุ่มตกแต่ง Search/Notifications เดิมใน Header ถูกแทนด้วยชื่อหน้าและคำอธิบาย ปุ่ม file search ใน toolbar ยังอยู่ตาม implementation เดิม
- File Browser ยังเป็น demo ในหน่วยความจำ ข้อมูลรีเซ็ตเมื่อ component ถูก unmount; งาน persistence และ Storage integration ต้องทำแยกตามแผน
