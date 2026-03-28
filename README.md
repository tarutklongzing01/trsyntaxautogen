# NightLoot Digital

เว็บขายสินค้า digital แนวเว็บขายไอดีเกม แบบ static hosting บน Firebase ใช้ `HTML/CSS/JavaScript` + `Firebase Auth` + `Firestore` + `Firebase Storage` + `Firebase Hosting`

## ฟีเจอร์

- สมัครสมาชิก / login / login with Google
- ระบบสมาชิกและโปรไฟล์
- รายการสินค้า digital แบ่งหมวดหมู่
- รายละเอียดสินค้า + ซื้อสินค้าด้วย balance
- wallet / balance
- แจ้งเติมเงินด้วยสลิปและรอแอดมินอนุมัติ
- เก็บ `orders` / `topups` / `users` / `products` ใน Firestore
- หน้า admin จัดการสินค้า / topups / orders / users
- ใช้ Firebase v9 modular
- มี security rules และ mock data

## โครงสร้างไฟล์

```text
.
|-- .firebaserc.example
|-- .gitignore
|-- firebase.json
|-- firestore.indexes.json
|-- firestore.rules
|-- storage.rules
|-- package.json
|-- README.md
|-- mock-data/
|   `-- products.json
|-- scripts/
|   |-- seed-mock-data.mjs
|   `-- set-admin.mjs
`-- public/
    |-- index.html
    |-- admin.html
    |-- 404.html
    |-- css/
    |   |-- main.css
    |   `-- admin.css
    |-- assets/
    |   `-- images/products/
    |       |-- gem-rush.svg
    |       |-- gpt-pass.svg
    |       |-- ai-credit.svg
    |       |-- elite-account.svg
    |       `-- combo-pack.svg
    `-- js/
        |-- firebase-config.js
        |-- firebase-config.example.js
        |-- app-config.js
        |-- lib/
        |   |-- dom.js
        |   |-- formatters.js
        |   `-- notifications.js
        |-- services/
        |   |-- firebase.js
        |   |-- auth-service.js
        |   |-- user-service.js
        |   |-- product-service.js
        |   |-- topup-service.js
        |   |-- order-service.js
        |   `-- storage-service.js
        `-- pages/
            |-- storefront.js
            `-- admin.js
```

## โครงสร้างข้อมูล Firestore

- `users/{uid}`
  - `displayName`, `email`, `role`, `balance`, `phone`, `lineId`, `discordId`, `photoURL`
- `products/{productId}`
  - `name`, `category`, `price`, `stock`, `status`, `badge`, `imageUrl`
- `topups/{topupId}`
  - `uid`, `amount`, `paymentMethod`, `status`, `slipPath`, `slipUrl`, `adminNote`
- `orders/{orderId}`
  - `uid`, `productId`, `productName`, `price`, `totalAmount`, `status`

## ตั้งค่า Firebase ทีละขั้น

### 1. สร้างโปรเจ็กต์ Firebase

1. เข้า Firebase Console
2. กด `Add project`
3. ตั้งชื่อโปรเจ็กต์
4. เข้าเมนู `Project settings`
5. กด `Add app` แล้วเลือก `Web`
6. คัดลอกค่า config ของเว็บแอปไว้

### 2. เปิดใช้งาน Authentication

1. ไปที่ `Build > Authentication`
2. กด `Get started`
3. เปิด provider `Email/Password`
4. เปิด provider `Google`
5. ถ้าใช้โดเมนจริงภายหลัง ให้เพิ่มโดเมนใน `Authentication > Settings > Authorized domains`

### 3. เปิด Firestore

1. ไปที่ `Build > Firestore Database`
2. กด `Create database`
3. เลือก region ที่ต้องการ
4. จะเริ่มด้วย test mode หรือ production mode ก็ได้ เพราะโปรเจ็กต์นี้มี `firestore.rules` ให้ deploy ทับอยู่แล้ว

### 4. เปิด Storage

1. ไปที่ `Build > Storage`
2. กด `Get started`
3. เลือก region เดียวกับ Firestore
4. สร้าง bucket ให้เรียบร้อย

### 5. ใส่ Firebase config ลงโปรเจ็กต์

แก้ไฟล์ [public/js/firebase-config.js](/c:/Users/Tarutserway/Desktop/555/public/js/firebase-config.js) ให้เป็นค่าจริงจาก Firebase Console

```js
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
};
```

### 6. ตั้งค่า Firebase CLI

ติดตั้ง CLI ถ้ายังไม่มี

```powershell
npm install -g firebase-tools
firebase login
```

สร้างไฟล์ `.firebaserc`

```powershell
Copy-Item .firebaserc.example .firebaserc
```

จากนั้นแก้ `your-firebase-project-id` ใน `.firebaserc` ให้ตรงกับโปรเจ็กต์จริง หรือใช้คำสั่งนี้แทน

```powershell
firebase use --add
```

### 7. ติดตั้ง dependency สำหรับสคริปต์ช่วยงาน

```powershell
npm install
```

### 8. Seed mock data สินค้าตัวอย่าง

ต้องใช้ service account key ของ Firebase Admin SDK

1. ไปที่ `Project settings > Service accounts`
2. กด `Generate new private key`
3. เก็บไฟล์ JSON ไว้ในเครื่อง

ตั้ง environment variable ใน PowerShell

```powershell
$env:SERVICE_ACCOUNT_PATH="C:\path\to\serviceAccountKey.json"
```

จากนั้น seed สินค้าตัวอย่าง

```powershell
npm run seed
```

### 9. Deploy rules, indexes, hosting

```powershell
firebase deploy --only firestore:rules,firestore:indexes,storage,hosting
```

หลัง deploy แล้ว

- หน้าร้านจะอยู่ที่ `/`
- หน้าแอดมินจะอยู่ที่ `/admin`

## วิธีตั้ง admin user

### วิธีที่ 1: ใช้สคริปต์

1. สมัครสมาชิกหรือ login ให้ user คนนั้นเข้าเว็บอย่างน้อย 1 ครั้งก่อน เพื่อให้มีเอกสารใน `users`
2. ตั้งค่า service account เหมือนขั้นตอน seed
3. รันคำสั่ง

```powershell
npm run set-admin -- user@example.com
```

ถ้าต้องการใช้ UID แทนอีเมลก็ได้

```powershell
npm run set-admin -- YOUR_UID
```

### วิธีที่ 2: แก้ใน Firestore Console

1. ไปที่ `Firestore Database`
2. เปิด collection `users`
3. หา document ของ user ที่ต้องการ
4. แก้ field `role` เป็น `admin`
5. รีเฟรชหน้า `/admin`

## วิธีใช้งานเบื้องต้น

1. เปิดหน้าร้าน
2. สมัครสมาชิก / login
3. เติมเงินโดยเลือกช่องทาง ชำระเงินจริง แล้วอัปโหลดสลิป
4. ให้แอดมินเข้า `/admin` เพื่ออนุมัติ topup
5. balance ของ user จะเพิ่ม
6. user กลับไปซื้อสินค้าได้ทันที ระบบจะหัก balance และสร้าง order อัตโนมัติ

## อัปขึ้น GitHub

ถ้าต้องการเริ่มเป็น git repo ในเครื่องนี้

```powershell
git init
git branch -M main
git add .
git commit -m "Initial commit: NightLoot Digital storefront and admin"
```

จากนั้นสร้าง repo ว่างบน GitHub แล้วผูก remote

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

หมายเหตุ

- ไฟล์ service account ถูกกันไว้ใน `.gitignore` แล้ว
- ไฟล์ [public/js/firebase-config.js](/c:/Users/Tarutserway/Desktop/555/public/js/firebase-config.js) เป็น client config จึงมองเห็นได้บนเว็บตามปกติ แต่ต้องพึ่ง `firestore.rules` และ `storage.rules` ในการป้องกันข้อมูล

## Deploy ไป Vercel

โปรเจ็กต์นี้ deploy เป็น static site ได้เลย เพราะหน้าเว็บทั้งหมดอยู่ใน `public/` และมีไฟล์ [vercel.json](/c:/Users/Tarutserway/Desktop/555/vercel.json) ช่วย map route `/` และ `/admin`

### วิธีที่ 1: Deploy ผ่าน GitHub Import

1. push โปรเจ็กต์ขึ้น GitHub ให้เรียบร้อย
2. เข้า Vercel Dashboard
3. กด `Add New Project`
4. เลือก repo นี้จาก GitHub
5. Vercel จะตรวจเป็น static project ให้อัตโนมัติ
6. กด deploy ได้เลย

### วิธีที่ 2: Deploy ด้วย Vercel CLI

```powershell
npm install -g vercel
vercel
vercel --prod
```

### หลัง deploy บน Vercel ต้องทำเพิ่ม

1. ไปที่ Firebase Console
2. เปิด `Authentication > Settings > Authorized domains`
3. เพิ่มโดเมน Vercel ของคุณ เช่น `your-project.vercel.app`
4. ถ้าใช้ custom domain ก็เพิ่มโดเมนนั้นด้วย

ถ้าไม่เพิ่มโดเมนนี้

- Email login อาจยังใช้ได้บางกรณี
- Google login จะติดปัญหาเรื่อง authorized domain

## ไฟล์ที่ควรแก้ก่อนใช้งานจริง

- [public/js/firebase-config.js](/c:/Users/Tarutserway/Desktop/555/public/js/firebase-config.js)
- [public/js/app-config.js](/c:/Users/Tarutserway/Desktop/555/public/js/app-config.js)
- [mock-data/products.json](/c:/Users/Tarutserway/Desktop/555/mock-data/products.json)
- [firestore.rules](/c:/Users/Tarutserway/Desktop/555/firestore.rules)
- [storage.rules](/c:/Users/Tarutserway/Desktop/555/storage.rules)

## หมายเหตุ

- เวอร์ชันนี้เป็น `manual fulfillment` สำหรับสินค้า digital และไอดีเกม แปลว่าระบบรับออเดอร์และตัดยอดได้เลย แต่การส่งของจริงยังเป็นงานแอดมิน
- รูปสินค้าใน mock data เป็น asset ภายในโปรเจ็กต์ และหน้า admin สามารถอัปโหลดรูปสินค้าใหม่ขึ้น Firebase Storage ได้
- Security rules ชุดนี้พยายามกันการแก้ balance เองจากฝั่ง client โดยบังคับให้การซื้อสินค้าเกิดพร้อมการสร้าง order และลด stock ใน transaction เดียว
