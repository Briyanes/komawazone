# Supabase Storage Setup untuk Upload Gambar

Untuk mengaktifkan fitur upload gambar di dashboard admin, Anda perlu membuat storage bucket di Supabase.

## Langkah Setup:

### 1. Buka Supabase Dashboard
- Login ke https://supabase.com
- Pilih project Anda

### 2. Buat Storage Bucket
1. Klik menu **Storage** di sidebar
2. Klik tombol **New bucket**
3. Isi detail:
   - **Name**: `manga-images`
   - **Public bucket**: ✅ Centang (agar gambar bisa diakses publik)
4. Klik **Create bucket**

### 3. Setup Policies (RLS)
Setelah bucket dibuat, setup policies untuk mengatur akses:

#### a. Policy untuk Upload (Create)
```sql
-- Policy: Allow authenticated users to upload
CREATE POLICY "Allow authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'manga-images');
```

#### b. Policy untuk Read (Public Access)
```sql
-- Policy: Allow public to view images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'manga-images');
```

#### c. Policy untuk Delete
```sql
-- Policy: Allow authenticated users to delete
CREATE POLICY "Allow authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'manga-images');
```

### 4. Verifikasi
Setelah setup:
1. Buka halaman admin manga upload
2. Coba upload gambar cover/banner
3. Gambar akan otomatis ter-upload ke Supabase Storage

## Struktur Folder Storage
```
manga-images/
├── covers/
│   └── [timestamp]-[random].jpg
└── banners/
    └── [timestamp]-[random].jpg
```

## Catatan
- Maksimal ukuran file: 5MB
- Format yang didukung: JPG, PNG, GIF, WEBP
- Gambar disimpan dengan nama unik untuk menghindari konflik
- URL gambar otomatis menjadi public URL dari Supabase Storage

## Troubleshooting

### Error: "Upload failed: new row violates row-level security policy"
Pastikan Anda sudah login sebagai admin dan policy sudah disetup dengan benar.

### Error: "Bucket not found"
Pastikan nama bucket adalah `manga-images` (sesuai dengan kode).

### Gambar tidak muncul
- Cek apakah bucket diset sebagai **public**
- Cek apakah policy untuk SELECT sudah dibuat
