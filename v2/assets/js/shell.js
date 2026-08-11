/* =====================================================================
   [ÜRÜN ADI] — OMURGA JS (config-driven rail + menü + rol motoru)
   Rol: ?role= → localStorage(gv_crm_role) → superadmin
   Bölüm: body[data-sec] · Aktif ekran: body[data-screen]
   Tüm shell metinleri STR/SECTIONS/ROLES config'inde — i18n'e hazır,
   sayfalara hardcode edilmez. Ortak çekirdek dosya — değişiklikler tek elden yapılır.
   =====================================================================

   KANONİK MOCK VERİ SETİ (tamamen kurgusal — tüm sayfalar BU adları kullanır)
   ─ Tenant: Yapıtaş İnşaat A.Ş. · Profesyonel Paket · crm.yapitas.example
   ─ Şantiyeler:
       Vadi Konakları        (konut, Çekmeköy/İstanbul, şef: Hasan Demirci, %68)
       Liman Lojistik Merkezi (ticari, Aliağa/İzmir,    şef: Aylin Koç,     %41)
       Merkez Şantiye        (depo+atölye, Gebze/Kocaeli, şef: Ömer Taşkın, %86)
       Kule Ofis B Blok      (ofis, Ataşehir/İstanbul — TAMAMLANDI 03/2026)
       Göl Evleri 2. Etap    (konut, Sapanca/Sakarya — PLANLAMA, başlangıç 09/2026)
       ─ 4 KAPALI ŞANTİYE (Dalga 20 — kurgusal, 0 personel; alan seti DALGA 20 bloğunda):
         Çınar Sokak Karma Proje (CSKP) — Pasif · Bahçelievler Toplu Konut (BTK) — Askıya
         Alınan · Fatih Mahallesi Restorasyon (FMR) — Arşivlenen · Kartal Sahil Rezidans
         (KSR) — İptal Edilen. Dördü de headcount/kasa/puantaj/yemekhane/hakediş toplamlarına
         GİRMEZ — Vadi 51 · Liman 30 · Merkez 12 · TOPLAM 93 (69 öz + 24 taşeron) AYNEN kalır.
   ─ Kişiler: Deniz Aksoy (Gavia platform) · Kemal Yapıcıoğlu (sahip) ·
       Murat Denizli (GM) · Elif Sarıkaya (teknik md.) · Hasan Demirci, Aylin Koç,
       Ömer Taşkın (şefler) · Nesrin Aydın (muhasebe) · Baran Yıldız (satın alma) ·
       Seda Karaca (İK) · Ali Vural (saha personeli)
   ─ Saha işçileri (Dalga 2A'da kanonikleşti — puantaj/personel/özlük BU adları kullanır):
       Vadi Konakları: Ali Vural (saha personeli) · İbrahim Sönmez (formen) ·
         Ramazan Kılıç (kalıpçı) · Selim Doğan (demir ustası) · Musa Erdem (düz işçi) ·
         Veli Şimşek (elektrik ustası)
       Liman Lojistik: Şükrü Aslan (formen) · Halil Güneş (operatör) ·
         Metin Çetin (kaynakçı) · Osman Polat (düz işçi)
       Merkez Şantiye: Recep Yaman (formen) · İlyas Kurt (marangoz) · Sadık Öz (düz işçi)
   ─ Taşeronlar: Demir-Beton İnş. Ltd. · Yalıtım Kardeşler · ElektroMek Taahhüt
   ─ Tedarikçiler: Ege Hazır Beton · Marmara Demir Çelik · Anadolu Hırdavat
   ─ Müşteri/Kurum: Körfez GYO · Aliağa Liman İşletmeleri · Sapanca Belediyesi
   ─ Cari ilgili kişileri (Dalga 1'de kanonikleşti — Kişiler sayfası bunları kullanır):
       Selin Aydemir (Körfez GYO) · Erhan Kaya (Aliağa Liman) · Zeynep Ulusoy (Sapanca Bel.) ·
       Yusuf Ergin (Demir-Beton) · Cemal Boz (Yalıtım Kard.) · Tolga Şener (ElektroMek) ·
       Kadir Solmaz (Ege Hazır Beton) · Burcu İnan (Marmara Demir Ç.) · Fatih Coşkun (Anadolu Hırd.)
   ─ Belge numaralama (Dalga 2'de doğdu, KANONİK — çapraz atıflar bu şemayı kullanır):
       KSA-2026-### kasa · MLZ-2026-### malzeme talebi · SAT-2026-### satın alma formu ·
       TH-2026-### taşeron hakediş · HKD-2026-### kurum hakediş · AVN-2026-### avans ·
       SZL-2025-T## / SZL-2026-K## sözleşme (T=taşeron, K=kurum) ·
       MKN-## makine · ISG-2026-### İSG tutanağı (Dalga 3'te doğdu)
       Not (4B): MLZ-2026-032/033 liste-dışı ESKİ tamamlanmış talepler — talepler
       listesi 034-046 aralığını gösterir; 032 → SAT-2026-009 (PVC, Vadi),
       033 → SAT-2026-010 (kaynak teli, Liman) kaynak referansı. Onay bekleyen
       talebe (043/045 gibi) tamamlanmış SAT formu BAĞLANMAZ.
   ─ Makine parkı (Dalga 3'te kanonikleşti — makine puantajı BU listeyi kullanır):
       Vadi Konakları: Ekskavatör CAT 320 (MKN-01, kiralık) ·
         Kule Vinç Potain MC-85 (MKN-02, öz mal) ·
         Beton Pompası Putzmeister M42 (MKN-03, hizmet: Ege Hazır Beton)
       Liman Lojistik: Mobil Vinç Liebherr LTM 1050 (MKN-04, kiralık, operatör: Halil Güneş) ·
         Forklift Toyota 8FD25 (MKN-05, öz mal)
       Merkez Şantiye: Beko Loder JCB 3CX (MKN-06, öz mal)
       (Kule Ofis tamamlandı / Göl Evleri planlama — makine parkı YOK)
   ─ Yemekhane bağlamı: kişi sayıları saha kadrosu+şef+taşeron ekipleriyle tutarlı
       (VK ~35 · Liman ~22 · Merkez ~12; taşeron yemekleri ayrı satırda gösterilir)
   ─ Tarih bağlamı: 2 Temmuz 2026, Perşembe
   ─ DALGA 4A KANONİK TANIMLAR (2026-07-03 — 4A sayfaları BU tanımları kullanır):
     · İzin türleri (12) + gün kuralı [MOCK-SİM — statik harita; mevzuat/kıdem motoru DEĞİL]:
         yillik   Yıllık İzin       → serbest (varsayılan 14)
         yol      Yol İzni          → yıllığa ek; checkbox ile +4 güne kadar
         mazeret  Mazeret İzni      → serbest (varsayılan 1)
         evlilik  Evlilik İzni      → 5  (otomatik)
         dogum    Doğum İzni        → 112 (16 hafta, otomatik)
         babalik  Babalık İzni      → 5  (otomatik)
         olum     Ölüm (Vefat) İzni → 3  (otomatik)
         raporlu  Raporlu           → rapor süresi kadar (serbest; rapor eki beklenir)
         ucretsiz Ücretsiz İzin     → serbest
         saatlik  Saatlik İzin      → gün alanı saat girişine döner (0,5 gün altı)
         tamgun   Tam Gün İzin      → 1   (sabit)
         yarim    Yarım Gün İzin    → 0,5 (sabit)
       Otomatik türlerde form "yasal süre otomatik uygulandı" notu gösterir.
   ─ Puantaj durum seti (mevcut 6 + 4A'da +4; puantaj sayfası ve şantiye-detay
       puantaj sekmesi AYNI seti kullanır):
         tam Tam gün (ok) · yarim Yarım gün (warn) · yok Gelmedi (danger) ·
         izin İzinli (info) · rapor Raporlu (muted) · fm Fazla Mesai FM (acc) ·
         em Eksik Mesai EM (warn koyu türev, color-mix) · rt Resmi Tatil RT (dashed) ·
         ht Hafta Tatili HT (dashed muted) — mevcut jenerik "tatil" HT'ye ayrışır, RT ayrı işaret.
   ─ Ajanda olay türleri + renk (kişisel ajanda; santiye-ajanda .ajd-card pattern'i):
         toplanti Toplantı (ink-2) · gorev Görev (acc-ink) · ziyaret Şantiye Ziyareti (info) ·
         izin İzin başl./bitiş (warn) · odeme Ödeme/Hakediş (ok) · termin Malzeme Teslim (danger)
   ─ Talep yaşam-döngüsü ek durumları (statik .gstat; gvChainBadge'e DOKUNULMAZ):
         "Tedarik Sürecinde" (info) · "Tamamlandı" (ok)
   ─ DALGA 4C KANONİK TANIMLAR (2026-07-03 — demirbaş/rapor sayfaları BU tanımları kullanır):
     · Zimmet/demirbaş numaralama: ZMT-YYYY-### (yıl = teslim/kayıt yılı).
       ZMT-2025-### serisi = KAPANMIŞ ESKİ KAYITLAR (iade edilmiş / hurdaya ayrılmış).
       Audit fix: 4B'deki "ZMT-2026-045 · teslim 10 Mar 2025" kaydı ZMT-2025-017'ye
       düşürüldü (tarih korundu); boşalan 045 numarası yeni kaleme verildi — seri boşluksuz.
     · Demirbaş kategorileri (6): Telefon & İletişim · Tablet · El Aleti ·
       Güvenlik Ekipmanı · Araç · Makine-Ekipman
     · Demirbaş durum rozetleri (statik .gstat): Zimmetli (ok) · Depoda (info) ·
       Serviste (warn) · Hurda (muted) · İade Edildi (off — kişi zimmet geçmişinde)
     · KANONİK ENVANTER (demirbaş listesi ↔ personel-detay zimmet sekmesi BİREBİR):
         ZMT-2026-041 İş Telefonu — Samsung Galaxy A54, 64GB      · Hasan Demirci · Vadi   · Zimmetli · 3 Oca 2026
         ZMT-2026-042 El Aleti Seti — Bosch GSB 18V-55, 18 parça  · Hasan Demirci · Vadi   · Zimmetli · 3 Oca 2026
         ZMT-2026-043 Güvenlik Ekipmanı — baret+yelek+bot seti    · Hasan Demirci · Vadi   · Zimmetli · 3 Oca 2026
         ZMT-2026-044 Araç — Ford Ranger pikap, 34 ABC 123        · Hasan Demirci · Vadi   · Zimmetli · 3 Oca 2026
         ZMT-2026-045 Tablet — Samsung Galaxy Tab A9, 64GB        · Aylin Koç     · Liman  · Zimmetli · 15 Şub 2026
         ZMT-2026-046 Lazer Metre — Bosch GLM 50 C                · Ömer Taşkın   · Merkez · Zimmetli · 20 Oca 2026
         ZMT-2026-047 Kırıcı-Delici — Hilti TE 60-A36             · (kişisiz)     · Merkez depo · Serviste (gönderim 25 Haz 2026)
         ZMT-2026-048 El Telsizi Seti — Motorola CP040, 4 adet    · (kişisiz)     · Merkez depo · Depoda
         ZMT-2025-017 El Telsizi — Motorola CP040                 · Hasan Demirci · —      · İade Edildi (teslim 10 Mar 2025 → iade 3 Oca 2026)
         ZMT-2025-009 Jeneratör — Honda EU22i                     · (kişisiz)     · —      · Hurda (teslim 8 Nis 2025 → hurda kararı 12 May 2026)
     · Raporlama merkezi: panel menüsü altında (yeni rail bölümü AÇILMAZ); 13 rapor
       kartı, 3 temsili ekran (puantaj/maliyet/personel). Rapor tutarları mevcut
       KSA/TH/HKD/MLZ kayıtlarından DERLENİR — yeni tutar UYDURULMAZ.
     · Ekran-seviyesi RBAC (ROLES[r].scr — 4C'de doğdu): İK operasyonda yalnız
       puantaj+demirbaş; saha personeli + satın alma panelde Raporlar'ı görmez.
       Roller matrisi (crm-ayarlar-roller.html) bu kısıtları "kısmi" rozetiyle gösterir.
   ─ DALGA 5C KANONİK TANIMLAR (2026-07-04 — LEAD ön-işi; 5C sayfaları BU tanımları kullanır):
     · KSG-2026-### kasa GİRİŞ/TAHSİLAT serisi (KSA-2026-### GİDER olarak kalır —
       mevcut KSA kayıtlarına ve gvChain gider akışına DOKUNULMAZ; KSA satırları
       tür etiketi olarak Ödeme/Avans Ödemesi alır, KSG satırları statik .gstat, zincir YOK):
         KSG-2026-001 ·  9 Haz 2026 · Giriş    · Genel merkez kasa beslemesi → Vadi Konakları   · ₺100.000 · (iç transfer, cari yok)
         KSG-2026-002 · 15 Haz 2026 · Tahsilat · Körfez GYO — HKD-2026-004 hakediş ödemesi      · ₺540.000 · Vadi
         KSG-2026-003 · 20 Haz 2026 · Giriş    · Genel merkez kasa beslemesi → Liman Lojistik   · ₺85.000
         KSG-2026-004 · 24 Haz 2026 · Tahsilat · Körfez GYO — HKD-2026-005 hakediş ödemesi      · ₺620.000 · Vadi
         KSG-2026-005 · 29 Haz 2026 · Tahsilat · Marmara Demir Çelik — hurda karkas demir satışı · ₺46.500 · Merkez
         KSG-2026-006 ·  1 Tem 2026 · Giriş    · Genel merkez kasa beslemesi → Merkez Şantiye   · ₺60.000
       Kural: Tahsilat tutarı bağlı belgeyle BİREBİR (HKD-2026-004 ₺540.000 + HKD-2026-005
       ₺620.000, ikisi de kurum sayfasında "Ödendi" — KSG bu ödemelerin kasa karşılığı).
       Aliağa HKD-001/002 ödemeleri KSG serisi ÖNCESİ kabul edilir (kayıt açılmaz);
       HKD-2026-003 "Onaylandı" = HENÜZ ödenmedi → KSG kaydı YOK.
     · KANONİK SAHA HEADCOUNT (mini-fix #3 çözümü — taşeron DAHİL tek sayı seti):
         Vadi Konakları   51 = 35 öz kadro + Demir-Beton 10 + ElektroMek 6
         Liman Lojistik   30 = 22 öz kadro + Yalıtım Kardeşler 8
         Merkez Şantiye   12 = 12 öz kadro (taşeron YOK — depo+atölye)
         TOPLAM SAHADA    93 = 69 öz + 24 taşeron
       Kaynak: yemekhane öğle öğün sayıları (öz 35/22/12 + taşeron 10/6/8) ZATEN CANLI
       kanonik; öğle toplamı 93 = headcount BİREBİR. santiye.html 48/61/33 ile
       panel-ozet 48/52/48 kırılımları BAYAT → 5C'de bu sete hizalanır.
       Metrik ayrımı: bireysel puantaj = ÖZ kadro (69; 13 temsili ad idiyomu sürer) ·
       taşeron puantajı KİŞİ BAZINDA tutulur; firma adam-gün özeti hakediş için korunur
       (D19 revizesi — 5C'deki "kişi adı listelenmez" kuralı Beyar onayıyla geri alındı,
       bkz. DALGA 19 KANONİK TANIMLAR; adam-gün toplamları DEĞİŞMEZ) ·
       bordro/idari kadro 22 kişi AYRI metrik (İK sayfaları) — headcount'a karışmaz.
       Hizalama hedefleri (5C üretim grep listesi): santiye.html personel kolonu
       48→51 · 61→30 · 33→12 + ph-sub "142 personel"→93; panel-ozet "142 kişi"/"142
       sahada"/"142/148"→90/93 (giriş kırılımı VK 49/51 · Liman 29/30 · Merkez 12/12;
       kayıtsız/izinli 3; oran %97) + şef bloğu 46/48→49/51; grep sweep "142|/148|
       46/48|50/52" → panel.html sef görünümü + kiosk (crm-panel-operasyon.html) +
       rapor-puantaj dahil TÜM sayfalar.
     · Makine yakıt/bakım kanonikleri (madde 10.2 — MKN parkı sayfa durumlarıyla senkron):
         MKN-01 Ekskavatör CAT 320     · motorin ~118 L/gün · son bakım 21 Haz 2026 (250 saat) · sonraki 500 saat
         MKN-02 Kule Vinç Potain MC-85 · elektrikli → yakıt "—"  · son bakım 12 Haz 2026 · aylık periyodik
         MKN-03 Beton Pompası M42      · hizmet alımı (Ege Hazır Beton) → yakıt/bakım hizmette, kolonlar "—"
         MKN-04 Mobil Vinç LTM 1050    · motorin ~65 L/gün  · son bakım 28 Haz 2026
         MKN-05 Forklift Toyota 8FD25  · motorin ~22 L/gün  · son bakım 5 Haz 2026
         MKN-06 Beko Loder JCB 3CX     · motorin ~40 L/gün  · ARIZALI (hidrolik) — servis kaydı 2 Tem 2026, sayfadaki durumla senkron
     · Yemekhane birim maliyet (madde 11 — mock, KDV dahil): kahvaltı ₺50 · öğle ₺90 ·
       akşam ₺75. 2 Tem günlük toplam: 84×50 + 93×90 + 46×75 = ₺16.020; taşeron payı
       58 öğün = ₺4.185 (ayrı gösterilir; hakediş kesintisi muhasebe değerlendirmesinde — UI notu).
   ─ DALGA 8 KANONİK TANIMLAR (2026-07-11 — kasa defteri + havuz + Pluxee + kredi kartı):
     · KASA DEFTERİ (şantiye-bazlı; dönem = yarım ay pencereleri; cari dönem 01–15 Tem 2026):
         Vadi Konakları : devir ₺48.250 · giriş ₺186.400 · çıkış ₺152.730 · MEVCUT ₺81.920
           (18 hareket: KSG-007/008 giriş + 16 gider — KSA-021 dahil, KSA-023..037 yeni)
         Liman Lojistik : devir ₺31.750 · giriş ₺0       · çıkış ₺13.230  · MEVCUT ₺18.520
           (KSA-020 ₺9.750 + KSA-038 ₺3.480)
         Merkez Şantiye : devir ₺12.860 · giriş ₺60.000  · çıkış ₺8.170   · MEVCUT ₺64.690
           (KSG-006 kanonik + KSA-039 ₺5.490 + KSA-040 ₺2.680)
         Kule Ofis B Blok: kasa KAPALI (proje teslim 03/2026, kapanış bakiyesi ₺0)
         Göl Evleri 2.Etap: kasa AÇILMADI (planlama)
         TOPLAM KASA BAKİYESİ: 81.920+18.520+64.690 = ₺165.130
       KSG serisi devamı: KSG-2026-007 · 1 Tem · Giriş · Genel merkez beslemesi → Vadi ₺120.000
                          KSG-2026-008 · 2 Tem · Tahsilat · Körfez GYO ek iş bedeli → Vadi ₺66.400
       KSA 023..032 = 1 Tem Vadi gün-sonu toplu girişi (2 Tem sabahı işlendi — geriye tarihli
       kayıt idiyomu); 033..037 = 2 Tem Vadi; 038 Liman; 039 (1 Tem, geriye tarihli)+040 Merkez.
       Çıktı ekranı (crm-operasyon-kasa-cikti.html) KASA_FORMATI düzenini birebir verir;
       imza dörtlüsü: Hasan Demirci (Kasa Tutan/Şantiye Şefi) · Nesrin Aydın (Kontrol/Muhasebe) ·
       Elif Sarıkaya (Teknik Ofis/Teknik Müdür) · Murat Denizli (Onaylayan/Genel Müd.)
     · GÖREV HAVUZU (Talep 1 + Not A): atanmadan kaydedilen görev ortak havuza düşer;
       "Üzerime Al" = localStorage(gv_gorev_claims) simülasyonu. KANONİK HAVUZ (8 görev —
       6'sı D8 kanonik, 2'si Dalga 20 / T-GOREV-02 eki; tümünü Kemal Yapıcıoğlu bıraktı;
       panel "Bekleyen Görevler" blokları AYNI listeyi kullanır):
         1 Liman Lojistik çevre aydınlatma keşfi        · Liman   · orta   · termin 8 Tem · 2 gündür
         2 Kule Ofis kesin hesap dosyası kontrolü        · Kule    · yüksek · termin 6 Tem · 1 gündür
         3 Vadi Konakları numune daire fotoğraf çekimi   · Vadi    · düşük  · termin 10 Tem · bugün
         4 Merkez depo yıl ortası sayım planı            · Merkez  · orta   · termin 9 Tem · 1 gündür
         5 Göl Evleri 2. Etap ruhsat evrak listesi       · Göl E.  · yüksek · termin 1 Tem GEÇTİ (geciken) · 3 gündür
         6 Şantiye araç takip çizelgesi güncelleme       · Merkez  · düşük  · termin 12 Tem · bugün
         7 Merkez Şantiye personel özlük evrak eksik kontrolü  · Merkez  · orta   · termin 11 Tem · 1 gündür [YENİ — İK havuzu]
         8 Göl Evleri 2. Etap yatırım komitesi sunum hazırlığı · Göl E.  · yüksek · termin 7 Tem  · bugün    [YENİ — Yönetim havuzu]
       Saha personeli (Ali Vural) havuzda YALNIZ kendi şantiyesini (Vadi → #3) görür.
       D15: panel "Bekleyen Görevler" Üzerime Al butonları da AYNI claim mekanizmasına
       bağlı (slug'lar crm-gorev data-claim ile birebir); Havuz/Bana menü rozetleri
       claim'lere göre düzelir (GV.syncGorevBadges). Kiosk "Aldığım İşler" şeridi
       BİLİNÇLİ statik — havuz-DIŞI eski claim'leri anlatır, senkron beklenmez.
     · PLUXEE KART (Talep 3 — kasa mantığı, kart bazlı; PLX-2026-### serisi):
       12 aktif kart = kanonik saha kadrosu (Vadi 6: Vural/Sönmez/Kılıç/Doğan/Erdem/Şimşek ·
       Liman 4: Aslan/Güneş/Çetin/Polat · Merkez 2: Yaman/Kurt) + 1 pasif (Sadık Öz — kayıp).
       Aylık toplu yükleme 1 Tem: 12 × ₺1.250 = ₺15.000 (PLX-2026-041 toplu kayıt).
       Toplam yüklü bakiye ₺11.240 · Tem yükleme ₺15.000 · Tem harcama ₺3.760.
       KART BAKİYE MODELİ (D19 revizesi — kart bazlı defter geçişinde yeniden türetildi):
       bakiye_i = ₺1.250 − o kartın Temmuz harcaması. Kartlar dönem başında SIFIRDAN
       yüklenir → her kartta devir ₺0, defterde DEVİR SATIRI YOKTUR. Zorunluluk:
       Σdevir = Σbakiye − Σyükleme + Σharcama = 11.240 − 15.000 + 3.760 = 0, yani
       G1/G2/G3 kilitliyken devirlerin hepsi sıfır olmak zorunda (bkz. tasks/kordon.md G).
       Eski serbest bakiye seti (₺580–₺1.180 aralığı) TERK EDİLDİ — 5 kartta negatif devir
       üretiyordu. YENİ KANONİK BAKİYELER (12 kart, toplam ₺11.240 KORUNUR; aralık ₺830–₺1.250):
         •4471 Ali Vural      ₺830   (harcama ₺420)   ·  •4482 İbrahim Sönmez ₺850  (₺400)
         •4493 Ramazan Kılıç  ₺880   (₺370)           ·  •4504 Selim Doğan    ₺890  (₺360)
         •4515 Musa Erdem     ₺1.250 (Tem harcaması YOK) · •4526 Veli Şimşek  ₺910  (₺340)
         •5871 Şükrü Aslan    ₺840   (₺410)           ·  •5882 Halil Güneş    ₺1.250 (Tem harcaması YOK)
         •5893 Metin Çetin    ₺870   (₺380)           ·  •5904 Osman Polat    ₺900  (₺350)
         •6231 Recep Yaman    ₺860   (₺390)           ·  •6242 İlyas Kurt     ₺910  (₺340)
       Halil Güneş'in ₺210 harcaması 30 HAZİRAN'dır (Temmuz penceresi dışında), bu yüzden
       kartı Musa Erdem gibi tam ₺1.250'de kalır — KPI'daki "10 işlem / ₺3.760" bozulmaz.
     · KREDİ KARTI (Talep 4 — kasa mantığı + banka seçimi; KKR-2026-### serisi):
         Garanti BBVA  •4512 · Hasan Demirci · limit ₺150.000 · dönem borcu ₺117.400 (%78 — warn)
         Akbank        •7789 · Baran Yıldız  · limit ₺100.000 · dönem borcu ₺41.300
         İş Bankası    •2301 · Merkez (Nesrin Aydın) · limit ₺200.000 · dönem borcu ₺63.800
         Yapı Kredi    •9944 · Elif Sarıkaya · limit ₺75.000  · dönem borcu ₺12.150
       14 hareket (akaryakıt, hırdavat, e-ticaret sarf, konaklama); KKR-2026-014 muhasebe
       onayında. Ekstre kesim: Garanti 8'i · Akbank 15'i · İş 20'si · YKB 25'i.
     · Rol notları (D8): İK operasyon scr += kasa, pluxee (salt-okunur içerik idiyomu —
       oluştur butonları OLUSTURABILIR dizileriyle zaten gizli). Kredi kartı sayfası
       sef'e KENDİ kartını gösterir (sayfa-lokal filtre, kasa sef idiyomu).
       Saha personeli operasyon bölümünü hiç görmez (secs) — kasa/pluxee/KK otomatik kapalı.
   ─ DALGA 9 KANONİK TANIMLAR (2026-07-11 — icmal + puantaj çıktı/saat revize + araçlar + iş programı raporu):
     · ARC-## araç sicil serisi — KANONİK FİLO (6 araç). Demirbaş "Araç" kategorisi bu modüle
       yönlenir; ZMT-2026-044 Ford Ranger = ARC-01 ile AYNI araç (zimmet kaydı demirbaşta yaşar):
         ARC-01 Ford Ranger 4x4 pikap (2023)     · 34 ABC 123 · Vadi   · Hasan Demirci (ZMT-2026-044) ·
           muayene 29.07.2026 (18 gün — warn) · bakım 42.300/50.000 km · Tem HGS ₺1.840 (22 geçiş) ·
           aylık maliyet ₺9.640 · Aktif
         ARC-02 Mercedes Sprinter 316 servis (2022) · 34 SRV 641 · Vadi · İbrahim Sönmez (servis şoförü) ·
           muayene 14.02.2027 · bakım 61.200/70.000 km · TEMİZ dosya (ceza/kaza yok) · aylık ₺11.280 · Aktif
         ARC-03 Toyota Hilux pikap (2021)        · 35 KLT 208 · Liman  · Aylin Koç · muayene 03.11.2026 ·
           bakım 78.450/80.000 km · Tem HGS ₺740 · aylık ₺8.120 · Aktif
         ARC-04 Fiat Doblo Cargo panelvan (2020) · 41 DBL 457 · Merkez · Recep Yaman · muayene 22.09.2026 ·
           bakım 87.400 km / 85.000 AŞILDI (danger) · SERVİSTE (30 Haz'dan beri bakımda) · aylık ₺6.940
         ARC-05 Renault Megane sedan (2024)      · 34 GNL 310 · Genel Merkez · Elif Sarıkaya ·
           muayene 08.04.2027 · bakım 18.900/30.000 km · Tem HGS ₺1.020 · aylık ₺7.310 · Aktif
         ARC-06 Ford Transit 350L kamyonet (2019) · 41 FTR 118 · Merkez · zimmetsiz (depo havuz aracı) ·
           muayene 30.08.2026 · bakım 132.600/135.000 km · Tem HGS ₺590 · aylık ₺8.860 · Aktif
       Araç KPI seti: filo 6 · yaklaşan muayene 1 (ARC-01, 18 gün) · açık ceza 1 · Tem HGS toplam ₺4.190.
       FORD RANGER DOSYASI (Not D zengin senaryo — arac-detay bu değerleri kullanır):
         22 HGS geçişi (Tem, ₺1.840) · ceza 2: hız 12.05.2026 ₺2.167 (Hasan Demirci bordro
         kesintisi — AÇIK, kesinti onay sürecinde) + park 03.04.2026 ₺993 (firma ödedi — kapalı) ·
         kaza 1: 18.06.2026 şantiye giriş rampası çarpması, hasar ₺18.500, sigorta %80 = ₺14.800,
         firma payı ₺3.700 · muayene 29.07.2026 → "18 gün" uyarısı · son bakım 15.05.2026 @40.000 km,
         sonraki 50.000 km (şu an 42.300 km).
     · ZİMMET GEÇMİŞİ + BORÇ/CEZA (demirbaş derinleştirme): ZMT-2026-047 Hilti TE 60-A36 —
       3 duraklı geçmiş: 12 Şub 2026 teslim → Ramazan Kılıç (Vadi) · 28 Nis 2026 depo iadesi ·
       5 May 2026 teslim → Ali Vural (Vadi) · 20 Haz 2026 iade (kontrolde gövde çatlağı) →
       hasar bedeli ₺650 borç kaydı (Ali Vural, bordro kesintisi muhasebe onayında) ·
       25 Haz 2026 servise gönderim (mevcut "Serviste" durumuyla senkron).
       (Plan notu düzeltmeleri: "Cemil Öztürk" kanonik kadroda yok → Ramazan Kılıç;
       "ZMT-2026-041" yazımı → Hilti kanonikte ZMT-2026-047.)
       Sayfa idiyomu (T3 kararı): crm-operasyon-demirbas-detay.html artık ?zmt= param'lı
       template — 3 kayıt: 041 telefon (DEFAULT, parametresiz eski davranış aynen),
       044 Ford Ranger (ARC-01 çapraz link), 047 Hilti (zimmet geçmişi + borç/ceza senaryosu).
       Personel-detay'daki parametresiz linkler bilinçli DOKUNULMADI (hepsi Hasan Demirci
       bağlamı → 041 default'una düşer, eşleşme doğru kalır).
     · PUANTAJ SAAT REVİZE (Talep 7): varsayılan mesai 08:00–18:00; fark rozeti saat cinsinden
       −N (.gstat.warn — erken çıkış) / +N (.gstat.info — fazla mesai). Revize YALNIZ aynı gün;
       geçmiş gün hücresi girişe kapalı (disabled + kilit ikonu + gvToast "Geçmiş güne revize yapılamaz…");
       arşiv haftası tümüyle girişe kapalı. localStorage: gv_pt_saat_*.
       Demo: Ali Vural Çar 1 Tem 08:00–15:00 → −3 (geçmiş gün, girişe kapalı; EM işaretiyle senkron) ·
       İbrahim Sönmez Per 2 Tem (bugün) 08:00–21:00 → +3 (canlı aynı-gün revize; FM işaretiyle senkron).
       (Plan notundaki "Cemil Öztürk +3" kanonik kadrodan İbrahim Sönmez'e atandı.)
     · HAFTALIK PUANTAJ ÇIKTISI (crm-operasyon-puantaj-cikti.html?santiye=&hafta=; hafta=Pzt ISO tarihi):
       başlık "HAFTALIK PUANTAJ TABLOSU" · AİT OLDUĞU ÇALIŞMA DÖNEMİ 29.06.2026 - 05.07.2026 ·
       İşyeri Sicil No (K4 kurgu, Vadi): 2-3401-02-01-0248671-034-56-77 ·
       resmi proje adı (K4 kurgu, Vadi): "İSTANBUL İLİ ÇEKMEKÖY İLÇESİ VADİ KONAKLARI 214 KONUT
       VE ÇEVRE DÜZENLEMESİ İNŞAATI".
       Liman (T2 kurgusu): sicil 1-3501-01-01-0193845-041-18-92 · "İZMİR İLİ ALİAĞA İLÇESİ
       LİMAN LOJİSTİK MERKEZİ DEPOLAMA VE DAĞITIM TESİSİ İNŞAATI" · imza: Şükrü Aslan/Aylin Koç.
       Merkez (T2 kurgusu): sicil 3-4102-01-01-0287410-019-63-45 · "KOCAELİ İLİ GEBZE İLÇESİ
       MERKEZ ŞANTİYE DEPO VE ATÖLYE TESİSİ İNŞAATI" · imza: Recep Yaman/Ömer Taşkın.
       Kağıt işaret idiyomu: + tam · ½ yarım · İ izinli · R raporlu · boş gelmedi · HT hafta
       tatili (EM/FM kağıtta "+" basılır; saat detayı yalnız ekranda). TOP.GÜN = +(1) + ½(0,5).
       Satırlar: Yapıtaş VK öz kadro 35 ADLI satır (kanonik 6 ad + temsili adlar), gün işaretleri
       "+" idiyomu, PERSONEL İMZA kolonu BOŞ hücre (ıslak imza); taşeron blokları da ADLI satır
       (D19 revizesi — taşeron puantajı kişi bazında tutulur; firma adam-gün özeti hakediş
       için korunur): Demir-Beton 10 ADLI satır · ElektroMek 6 ADLI satır; taşeron satırlarında
       PERSONEL İMZA kolonu kişi ıslak imzasıdır, "Firma yetkilisi" imzası FİRMA BAZLI HAFTALIK
       ÖZET bloğunda kalır (D19/S8).
       Firma özeti: YAPITAŞ 35 · DEMİR-BETON 10 · ELEKTROMEK 6 → TOPLAM 51 (kanonik headcount BİREBİR).
       (Plan "23 kişilik liste" kanonik 35 ile çelişir → 35'e hizalandı.)
     · YEMEKHANE TAŞERON FİLTRESİ (Talep 6 — D12 taşeron kartı "yemekhane kişi sayısı" alanı
       BU değerleri kullanır): 2 Tem öğle 93 = Yapıtaş öz 69 (35/22/12) + Demir-Beton 10 +
       ElektroMek 6 + Yalıtım Kardeşler 8 (taşeron toplam 24). Plan şeması "Taşeron A 14 + B 10"
       kanonik firma kadrolarıyla (10/6/8) çelişir → FİRMA BAZLI 10/6/8 KESİN.
     · SATIN ALMA İCMALİ (Talep 5): SAT-2026-018 · Vadi Konakları mekanik tesisat paketi ·
       9 kalem · 5 tedarikçi (plan 1.5 birebir): Ege Hazır Beton · Trakya Beton · Marmara Yapı
       Market · Deta Demir Çelik · Nokta Hırdavat (4 tam + 1 kısmi teklif; en iyi fiyat 3
       tedarikçiye dağılır) · GENEL TOPLAM ₺742.300 · GM onayında (₺100.000 eşik üstü) ·
       çıktı: crm-satinalma-icmal-cikti.html?form=SAT-2026-018.
       Kaynak talep: MLZ-2026-030 (T1 kararı — 032/033 "liste-dışı eski kayıt" idiyomuyla
       açıldı; 5 Haz 2026, durum "Tedarik Sürecinde", zincir Hasan Demirci → Baran Yıldız.
       Bu numara REZERVE — başka dalgada farklı kayda VERİLMEZ. Seçili tedarikçi Deta Demir
       Çelik ₺742.300 (en ucuz DEĞİL — Ege ₺699.100; gerekçe: tek elden montaj koordinasyonu +
       2 yıl garanti + 60 gün vade). En iyi fiyat kombinasyonu ₺667.000.
     · İŞ PROGRAMI RAPORU (Not E — crm-panel-rapor-isprogrami.html?santiye=):
       Liman Lojistik: kaba yapı 12 gün GECİKME (danger) · mekanik tesisat 3 gün ÖNDE ·
       Vadi Konakları: programında (kaba inşaat +2 gün önde — santiye-detay hero ile senkron) ·
       Merkez Şantiye: programında (%86). Rapor kartı panel-raporlar hub'ında; şantiye listesi
       satır aksiyonunda rapor ikonu YALNIZ 3 aktif şantiyede (ölü link yasağı).
   ─ DALGA 10 KANONİK TANIMLAR (2026-07-11 — firma profili + kiosk işler/light + işlem kayıtları + süpürme part-1):
     · FİRMA PROFİLİ KANONİK ALAN SETİ (crm-ayarlar-firma.html 5 sekme; D13 gavia-firma-detay
       "Genel" sekmesi BU seti BİREBİR kullanır — yapısal ikiz ŞARTI):
         [Firma Kimliği]  logo alanı (div+background-image kuralı) · marka rengi (mint sabit,
           Faz 1 tek accent) · kurumsal kimlik önizleme (evrak antet kartı)
         [Firma Bilgileri] unvan "Yapıtaş İnşaat A.Ş." · vergi dairesi "Ümraniye VD" ·
           vergi no "935 041 7768" · ticaret sicil no "İST-254891" · MERSİS "0935 0417 7680 0015" ·
           NACE "41.20.02 — İkamet amaçlı olmayan binaların inşaatı" · kuruluş 2011 ·
           merkez adres "İnşaatçılar Cad. No:12, Ümraniye / İstanbul" ·
           şube "Gebze Depo & Atölye — Merkez Şantiye sahası" · tel 0216 000 00 00 ·
           e-posta info@yapitas.example · IBAN listesi (3, tamamı kurgusal):
             TR12 0006 2000 4560 0006 2988 91 · Garanti BBVA — Ana hesap
             TR44 0004 6000 3288 8000 1594 07 · Akbank — Hakediş tahsilat
             TR73 0001 0002 3812 3456 7850 02 · Ziraat — Maaş ödeme
           yetkililer: Kemal Yapıcıoğlu (Firma Sahibi — 1. derece imza, sirküler NOT-2025/8817) ·
             Murat Denizli (Genel Müdür — 2. derece imza, ₺500.000 üstü çift imza kuralı)
         [Aidiyet & Tercihler] dil: Türkçe (K6 — gerçek alan, topbar çipi KALDIRILDI) ·
           para birimi ₺ TRY · hafta başlangıcı Pazartesi · tarih biçimi GG.AA.YYYY ·
           evrak önekleri tablosu (KSA/KSG/MLZ/SAT/TH/HKD/AVN/İZN/ISG/ZMT/ARC/PLX/KKR/LOG)
         [Paket & Kullanım] plan-card (Profesyonel ₺14.900/ay) + limitler (18/25 kullanıcı ·
           3/5 şantiye · 34/50 GB · 2.400/5.000 SMS) + fatura geçmişi (Tem/Haz ₺14.900, May ₺13.400)
         [Modüller] mod-row listesi — moduller sayfasıyla senkron (D13 süpürmesiyle 10/10 açık;
           3 genişleme modülü tanıtım eklentisi — DALGA 13 bloğuna bak)
     · SÜPÜRME PART-1 (1.13 / K6 / K7): topbar TR dil çipi KALDIRILDI (dil tercihi artık
       Aidiyet & Tercihler'de gerçek alan); "Gavia Asistan" modül satırı TAMAMEN GİZLENDİ
       (K7 — teaser bırakılmaz); "Çok Dil" modül satırı da kaldırıldı (K6 — çok-dil
       kapsam DIŞI; modül sayacı 7/10). Hesap dropdown'u 3 GERÇEK sayfaya bağlandı:
       crm-ayarlar-profil.html · crm-ayarlar-hesap.html · crm-ayarlar-bildirim-tercih.html —
       SECTIONS.hesap (rail-DIŞI bölüm, tüm roller erişir; içerik aktif personadan okunur).
       Kurgusal e-posta idiyomu: ad.soyad@yapitas.example (superadmin: deniz.aksoy@gavia.example).
       satis kilidi + tenant-chip + modül toggle unlock D13'te süpürülür — bu dalgada DOKUNULMADI.
     · İŞLEM KAYITLARI (1.12 — LOG-2026-#### serisi, yalnız superadmin+sahip):
       crm-ayarlar-log.html; 32 kayıt / son 3 gün (bugün 14 · dün 10 · 30 Haz 8);
       KPI: bugün 14 işlem · onay 5 · red/revize 2 · kritik değişiklik 3. Modül kırılımı:
       kasa 7 · görev 6 · satınalma 4 · puantaj 5 · hakediş 4 · ayarlar 6. En üst kayıt
       LOG-2026-0834 (firma sayfası önek örneğiyle senkron).
       Kayıtlar mevcut kanonik belge no'larından DERLENİR (KSA-021 gönderim, KSG-008 tahsilat,
       TH-014 muhasebe adımı, SAT-018 icmal seçimi, İZN-031 şef onayı, ISG-008 aksiyon…);
       kritik değişiklik örneği: "Kemal Yapıcıoğlu kasa onay eşiğini ₺25.000→₺40.000 değiştirdi".
     · KİOSK (1.11): "Benim İşlerim" şeridi 2 bölmeye genişledi — Aldığım İşler (kaynak rozeti
       havuzdan/atandı + termin; HAVUZ 6 kaydına DOKUNULMAZ, havuzdan-alınmış örnekler havuz
       listesi DIŞI eski claim'lerdir) ve Yaptığım İşler (bugün/bu hafta; tamamlananlar
       crm-gorev.html Tamamlananlar kanonuyla tutarlı). Light mode K5: yalnız kiosk,
       localStorage['gv_kiosk_theme'] ('dark' varsayılan | 'light'), body.k-light + sayfa-lokal
       --k-* değişkenleri; tokens.css'e DOKUNULMADI. Desktop: 1200–1679px 12 kolon düzen
       (sol 8 içerik + sağ 4 özet rayı, .k-rail); 1920 TV düzeni AYNEN korunur.
   ─ DALGA 11 KANONİK TANIMLAR (2026-07-11 — satış bölümü: müşteri + pipeline + birimler +
       teklif + sözleşme/teslimat + satış sonrası; portal/gavia/tenant-chip D13'te):
     · Yeni prefix'ler: MST- müşteri · FRS- fırsat · TKF- teklif · ODP- ödeme planı ·
       SSZ- satış sözleşmesi · TSL- teslim tutanağı · SST- satış sonrası talep ·
       CAR-2026-0## cari hesap no (D11'de doğdu — satış müşterisi cari kartlarında görünür).
       Birim kodu şeması: VK-{A..D}-{01..24} · GE2-V{01..40} · KO-B-{kat 1..5}{01..12}.
     · YENİ ROLLER (9→11): satistemsilci Selin Acar (SA) — secs [panel,gorev,satis], panel
       scr kısıtlı (Raporlar YOK), indirim yetkisi %0–3, satis liste sayfalarında YALNIZ
       kendi kayıtları (data-tems budaması; birim stoku ve SST tam görünür) ·
       satismudur Okan Eren (OE) — secs [panel,gorev,satis,cari], panel scr kısıtlı
       (Raporlar YOK), indirim onayı %3–7, tüm pipeline. %7+ indirim → GM (yonetim; K11).
       teknik satis'te YALNIZ Satış Sonrası (scr:[talepler]). İndirim onay zinciri gvChain:
       %0–3 temsilci · %3–7 satış müdürü · %7+ genel müdür.
     · SATIŞ EVRENİ (birim stoku — birimler/pipeline/teklif/sözleşme sayfaları BİREBİR):
       Vadi Konakları 96 birim (4 blok A–D × 24 = 6 kat × 4 daire; kat 1-2 2+1 ₺4.200.000 ·
         kat 3-5 3+1 ₺6.120.000 · kat 6 dubleks ₺9.800.000):
         44 Satıldı · 6 Opsiyonlu · 3 Rezerve · 39 Satışta · 4 Kapalı
         (A-01/A-02 arsa sahibi Halil Sancak kat karşılığı · B-24 satış ofisi · D-24 numune daire)
       Göl Evleri 2. Etap 40 villa (V-01..V-40, lansman öncesi ön-satış; ₺12,8M–₺16,4M):
         12 Opsiyonlu ön-talep (V-05 Onaran · V-07 Karaduman · V-12 Us · V-21/V-22 Toprak ·
         V-25..V-30 Nova bayi · V-33 bağımsız ön-talep) · 28 Satışta
       Kule Ofis B Blok 60 ofis (teslim 03/2026): 52 Satıldı (50 Teslim Edildi · 2 teslim
         sürecinde: B-311, B-406) · 8 Kiralandı (B-207 kira bitişi 31 Tem — Ferda Yücel aday)
       Opsiyon bitişi YAKLAŞAN 2 birim uyarılı: VK-B-11 (14 Tem, Şahinoğlu) · GE2-V12 (13 Tem, Us).
       Rezerve 3: VK-B-19 (Kavukçu, teklif onayda) · VK-C-24 (Toprak, kapora) ·
       VK-D-05 (Korkut, sözleşme imzada). Satılmış birimde teklif butonu DISABLED + tooltip
       ("aynı birim iki müşteriye satılamaz").
     · MÜŞTERİLER (10 kayıt; temsilci S=Selin Acar · O=Okan Eren):
       MST-2026-001 Selçuk Onaran      kurumsal    referans     O — KO-B-304 teslim + VK-C-18
         taksitli; PORTAL demo müşterisi (portal sayfaları D13; rozet ŞİMDİDEN) · cari CAR-2026-021
       MST-2026-002 Derya Toprak       yatırımcı   satış ofisi  O — VK-A-03/A-09/C-21 aldı;
         5. taksit 12 GÜN GECİKMEDE (D13 risk uyarısıyla senkron) · cari CAR-2026-022;
         ayrıca VK-C-24 kapora + GE2 V-21/V-22 görüşme
       MST-2026-003 Aylin Şahinoğlu    bireysel    web          S — VK-B-11 OPSİYON (bitiş 14 Tem);
         TKF-2026-003 onaylı %3 + ODP-2026-001 örnek ödeme planı; ayrıca VK-B-12 sunum
       MST-2026-004 Mert Kavukçu       bireysel    sosyal medya S — VK-B-19 TEKLİF
         (TKF-2026-006 %5, müdür onayında; birim rezerve)
       MST-2026-005 Baha & Zeynep Korkut bireysel  referans     S — VK-D-05 SÖZLEŞME
         (SSZ-2026-007 imza bekliyor)
       MST-2026-006 Nova Gayrimenkul   bayi        fuar         O — GE2 6 villa MÜZAKERE
         (TKF-2026-007 %9, GM onayında) + VK 3 daire (A-11/A-12/A-14) teklif taslak
       MST-2026-007 Halil Sancak       arsa sahibi satış ofisi  O — VK A-01/A-02 kat karşılığı;
         GE2 3. etap arsa GÖRÜŞME
       MST-2026-008 Ferda Yücel        kiracı adayı WhatsApp    S — KO-B-207 kiralama GÖRÜŞME
         (TKF-2026-005 süresi dolmuş)
       MST-2026-009 Tuncay Ilgaz       bireysel    web          S — KAYBEDİLDİ (neden: Fiyat;
         TKF-2026-004 %12 talebi RED)
       MST-2026-010 Nihat Karaduman    bireysel    web          O — GE2 V-07 YENİ
       Kaynak dağılımı: web 3 · referans 2 · satış ofisi 2 · sosyal 1 · WhatsApp 1 · fuar 1.
       HAM LEAD idiyomu (müşteri kartı AÇILMAMIŞ, yalnız pipeline kartında "kart açılmadı"
       rozeti): Gökhan Sepetçi (web, S) · Pınar Us (fuar, O) · İlker Baysal (satış ofisi, S).
       ARŞİV adları (liste DIŞI — satılan 44 birimin eski alıcı örnekleri): Volkan Demirel
       (VK-D-14) · Serdar Tokgöz (kayıp) · Rıza Kalkan (KO-B-311) · Meltem Işık (KO-B-406) ·
       Ejder Balcı (KO-B-107) · Seray Ünal (KO-B-212).
     · PİPELİNE (7 aktif kolon: Yeni · Görüşme · Sunum/Gezi · Teklif · Müzakere · Opsiyon ·
       Kapora + özet şerit Sözleşme/Kazanıldı/Kaybedildi — K10). 14 AÇIK FIRSAT:
         Yeni(2):     FRS-2026-016 Karaduman GE2-V07 · FRS-2026-017 Sepetçi VK 2+1 (lead)
         Görüşme(2):  FRS-2026-012 Yücel KO-B-207 kira · FRS-2026-013 Sancak GE2 arsa
         Sunum(3):    FRS-2026-014 Baysal VK-D-23 dubleks gezisi (lead) ·
                      FRS-2026-015 Toprak GE2 V-21+V-22 · FRS-2026-018 Şahinoğlu VK-B-12
         Teklif(2):   FRS-2026-009 Kavukçu VK-B-19 · FRS-2026-010 Nova VK 3 daire
         Müzakere(2): FRS-2026-007 Nova GE2 6 villa · FRS-2026-008 Onaran GE2-V05
         Opsiyon(2):  FRS-2026-005 Şahinoğlu VK-B-11 (14 Tem UYARI) ·
                      FRS-2026-006 Us GE2-V12 (13 Tem UYARI)
         Kapora(1):   FRS-2026-011 Toprak VK-C-24
       Özet şerit — Sözleşme 1: Korkut VK-D-05 · KAZANILDI 5 (son 90 gün): Onaran VK-C-18 ·
       Toprak A-03/A-09/C-21 (3 fırsat) · Demirel VK-D-14 · KAYBEDİLDİ 3 (neden rozeti ZORUNLU):
       Ilgaz VK-B-07 (Fiyat) · Kavukçu GE2-V15 (Finansman — VK'da aktif teklifle döndü) ·
       Tokgöz VK-A-21 (Rakip proje). satistemsilci açık fırsatı 6 (Şahinoğlu×2, Kavukçu,
       Yücel, Sepetçi, Baysal) — menü cnt override'ı ile senkron.
     · TEKLİFLER (9; gvChain indirim zinciri):
       TKF-2026-001 Onaran VK-C-18 %2 Onaylı (→SSZ-2026-003) ·
       TKF-2026-002 Toprak 3 daire paketi %6 Onaylı (→SSZ-2026-004) ·
       TKF-2026-003 Şahinoğlu VK-B-11 %3 Onaylı + ODP-2026-001 ·
       TKF-2026-004 Ilgaz VK-B-07 %12 RED (GM) · TKF-2026-005 Yücel KO-B-207 kira SÜRESİ DOLDU ·
       TKF-2026-006 Kavukçu VK-B-19 %5 MÜDÜR ONAYINDA · TKF-2026-007 Nova GE2 %9 GM ONAYINDA ·
       TKF-2026-008 Nova VK 3 daire TASLAK · TKF-2026-009 Baysal VK-D-23 TASLAK
       ODP-2026-001 (Şahinoğlu B-11): liste ₺6.120.000 → %3 indirim → ₺5.940.000 =
       peşinat ₺1.485.000 (%25) + 36 × ₺103.750 + teslimde ₺720.000.
     · SÖZLEŞME & TESLİMAT (7 SSZ + 3 TSL; 12 kalemli teslim checklist):
       SSZ-2025-042 Onaran KO-B-304 İmzalı (→TSL-2026-001 teslim edildi) ·
       SSZ-2026-003 Onaran VK-C-18 İmzalı — bedel ₺6.120.000: peşinat ₺918.000 (%15) +
         36 × ₺115.000 + teslimde ₺1.062.000; 14/36 taksit ödendi, KALAN ₺3.592.000
         (D13 portal + cari kartı AYNI sayıyı kullanır) ·
       SSZ-2026-004 Toprak 3 daire paketi İmzalı — ₺13.665.000 (%6 ind.): %50 peşin
         ₺6.825.000 + 12 × ₺570.000; 4 ödendi, 5. taksit 12 GÜN GECİKMEDE, kalan ₺4.560.000 ·
       SSZ-2026-005 Demirel VK-D-14 İmzalı ·
       SSZ-2025-051 Kalkan KO-B-311 TESLİM SÜRECİNDE — checklist 12 kalem: 9 tamam /
         2 eksik iş (→SST-2026-001 mutfak dolap kapağı ayarı · SST-2026-002 banyo silikon
         yenileme) / 1 bekliyor ·
       SSZ-2025-058 Işık KO-B-406 TESLİM SÜRECİNDE · SSZ-2026-007 Korkut VK-D-05 İMZA BEKLİYOR.
       TSL-2026-001 Onaran KO-B-304 · TSL-2026-002 Balcı KO-B-107 · TSL-2026-003 Ünal KO-B-212.
     · SATIŞ SONRASI (11 SST; tür: eksik iş 4 · garanti 2 · bakım 2 · şikayet 1 · bilgi 1 ·
       teslimat problemi 1; durum: açık 3 · işlemde 3 · tamamlandı 4 · reddedildi 1 —
       menü cnt 6 = açık+işlemde). PORTAL kaynaklı 2 kayıt "Portal" rozetli (portal D13):
       SST-2026-007 Onaran KO-B-304 klima drenaj GARANTİ (Portal) · SST-2026-010 Onaran
       VK-C-18 taksit planı BİLGİ (Portal). Eksik iş 4: SST-001/002 (B-311 checklist) +
       Balcı B-107 süpürgelik + Ünal B-212 kapı zili. Garanti 2.: Ünal B-212 pencere contası.
       Bakım 2: KO ortak alan klima · asansör periyodik. Şikayet: Işık B-406 otopark su
       birikintisi. Teslimat problemi: Işık B-406 randevu ertelenmesi. teknik rolü satis'te
       YALNIZ bu ekranı görür; SST'de temsilci budaması YOK (matris: tam erişim).
     · CARİ ÇAPRAZ LİNK (2.0.2): satışı tamamlanan müşteri kartında "Cari Hesabı → CAR-…";
       cari kartında geri link "Cari kartı → MST-…". CAR-2026-021 Onaran (bakiye ₺3.592.000
       borç) · CAR-2026-022 Toprak (bakiye ₺4.560.000 borç; ₺570.000 vadesi 12 gün geçmiş).
       crm-cari-detay.html ?cari= param şablonu (demirbaş ?zmt= idiyomu; parametresiz
       default Demir-Beton AYNEN korunur).
     · satis menü cnt: Pipeline 14 · Teklifler 2 (onay bekleyen) · Satış Sonrası 6.
       satistemsilci override: Pipeline 6 · Teklifler 1. SATIŞ UNLOCK KURALI: locked:true
       ancak 14 crm-satis-*.html dosyasının TAMAMI diskte varken kaldırılır (ölü link yasağı).
   ─ DALGA 12 KANONİK TANIMLAR (2026-07-11 — tedarik & finans genişlemesi: sipariş zinciri +
       stok & depo + tedarikçi + proje bütçe + gerçekleşen maliyet + nakit akışı + taşeron
       kartları; dashboard/portal/gavia D13'te):
     · Yeni prefix'ler: SIP-2026-## sipariş · IRS-2026-## irsaliye · FTR-2026-## fatura ·
       STK-2026-### stok hareketi · TDR-## tedarikçi kartı · TAS-## taşeron kartı ·
       BTC-2026-R# bütçe revizyonu. Depo kodları: D-MRK Merkez Ana Depo · D-VDI Vadi
       Şantiye Deposu · D-LMN Liman Şantiye Deposu · D-ARC Araç Deposu (mobil — Ford
       Transit ARC-06 üstü gezici takım/sarf).
     · SİPARİŞLER (8 SIP; sipariş = onaylı SAT formundan doğar; eski tamamlanmış SAT'ların
       siparişleri kapanmış SIP kayıtlarıyla temsil edilir):
         SIP-2026-01 · 14 Nis · Ege Hazır Beton      · Vadi   · C30/37 hazır beton 850 m³ · ₺1.487.500 · Kapandı (FTR-01..03 ödendi)
         SIP-2026-02 · 5 May  · Anadolu Hırdavat     · Liman  · kaynak teli + sarf paketi (MLZ-2026-033 → SAT-2026-010) · ₺96.400 · Kapandı (FTR-2026-04 ödendi)
         SIP-2026-03 · 12 May · Boğaziçi Yapı Market · Vadi   · PVC doğrama (MLZ-2026-032 → SAT-2026-009) · ₺418.200 · Teslim Edildi (IRS-2026-09 · FTR-2026-06 vade 15 Tem)
         SIP-2026-04 · 20 May · Delta Elektrik       · Liman  · elektrik tesisat malzemesi (kablo+pano) · ₺734.600 · TERMİN GECİKMESİ — termin 24 Haz, 8 gün geçti, teslimat YOK (danger; D13 "Delta termin gecikmesi" risk uyarısının kaynağı)
         SIP-2026-05 · 2 Haz  · Marmara Demir Çelik  · Vadi   · nervürlü inşaat demiri 4 kalem 88 ton · ₺2.840.000 · Kısmi Teslim (TAM ZİNCİR — aşağıda)
         SIP-2026-06 · 10 Haz · Trakya Beton Santrali· Liman  · C35/45 beton 420 m³ · ₺798.000 · Tedarikçide (sevkiyat programlı; Trakya'nın 12 May sevkiyatındaki 3 gün gecikmesi AYRI eski kayıt — performans skoruna yansıdı)
         SIP-2026-07 · 25 Haz · Ege Hazır Beton      · Vadi   · şap betonu 120 m³ · ₺186.000 · Onaylandı (termin 9 Tem)
         SIP-2026-08 · 1 Tem  · Boğaziçi Yapı Market · Merkez · depo raf sistemi · ₺112.750 · Taslak (onaya gönderilmedi)
       Menü cnt Siparişler 5 = açık sipariş (04 gecikme + 05 kısmi + 06 tedarikçide + 07 onaylandı + 08 taslak).
     · TAM ZİNCİR (doc §6.8 — sipariş detayı gvChain bu akışı birebir verir):
       MLZ-2026-031 (26 May, Vadi betonarme demir ihtiyacı; LİSTE-DIŞI eski talep idiyomu —
       talepler listesi 034-046 gösterir; zincir Hasan Demirci → Baran Yıldız; bu numara
       REZERVE) → onay → İCMAL 3 teklif: Marmara Demir Çelik ₺2.840.000 SEÇİLDİ (60 gün
       vade + tonaj sevk programı; en ucuz DEĞİL) · Deta Demir Çelik ₺2.812.000 (30 gün
       vade) · Nokta Hırdavat ₺2.918.000 → SIP-2026-05 (kalemler: Ø10 8t · Ø12 38t ·
       Ø16 12t · Ø20 30t = 88t) → İRSALİYELER: IRS-2026-12 (18 Haz; Ø12 20t + Ø16 6,4t +
       Ø20 14t = 40,4t) + IRS-2026-14 (26 Haz; Ø10 8t + Ø12 18t + Ø16 5,2t + Ø20 16t =
       47,2t) → Ø16 kalemi 12t sipariş / 11,6t irsaliye = −0,4t MİKTAR UYUŞMAZLIĞI (uyarı;
       menü cnt İrsaliye & Fatura 1) → FTR-2026-09 (28 Haz · ₺2.840.000 sipariş miktarı
       üzerinden kesilmiş · vade 27 Ağu/60 gün · durum: Muhasebe kontrolünde — irsaliye
       toplamıyla uyuşmazlık; bu yüzden cari hesaba İŞLENMEDİ → cari-durum Marmara bakiyesi
       ₺211.000 olarak kalır, TUTARLI) → mal kabul stok girişleri STK-2026-041 (IRS-12) +
       STK-2026-047 (IRS-14).
       IRS/FTR serisi kuralı: numara sırası = tarih sırası. Pinli: IRS-09 (9 Haz, SIP-03
       PVC) · IRS-12 · IRS-14; FTR-04 (Anadolu ₺96.400 ödendi) · FTR-06 (Boğaziçi ₺418.200,
       fatura 12 Haz, vade 15 Tem — nakit akışında planlı ödeme) · FTR-09 (yukarıda).
       Kalan IRS 01..08/10/11/13 ve FTR 01..03/05/07/08 numaraları SIP-01/02/06 eski
       teslimat-faturalarına ÖDENDİ/kapalı durumla dağıtılır — YENİ vadeli borç üretilmez
       (nakit akışı yalnız FTR-06 + FTR-09 vadesini bilir).
     · STOK & DEPO (K8 — 4 depo · ~20 kalem · 6 hareket türü; toplam stok değeri ₺4.860.000):
       Depo sorumluları: D-MRK Recep Yaman · D-VDI İbrahim Sönmez · D-LMN Şükrü Aslan ·
       D-ARC Recep Yaman (araç: ARC-06 Ford Transit).
       MİN-STOK ALTI 3 KALEM (menü cnt Stok & Depo 3; doc kabul kriteri):
         Ø16 nervürlü demir  · D-VDI · 1,7 t / min 5 t   (SIP-05 eksik teslim −0,4t hikayesiyle bağlı)
         İSG baret+yelek seti· D-MRK · 9 ad / min 25 ad
         NYM 3×2,5 kablo     · D-LMN · 180 m / min 500 m (Delta SIP-04 termin gecikmesiyle bağlı — ikmal bekliyor)
       6 hareket türü pinli örnekleri:
         Giriş    STK-2026-041 · 18 Haz · IRS-2026-12 mal kabul · D-VDI (+ STK-2026-047 · 26 Haz · IRS-2026-14)
         Çıkış    STK-2026-052 · 2 Tem  · B Blok 3. kat demir imalatı Ø12 4,2t · D-VDI
         Transfer STK-2026-049 · 30 Haz · D-MRK → D-VDI el aleti + jeneratör yakıt varili
         İade     STK-2026-045 · 24 Haz · sahadan depoya artan PVC kasa 12 ad · D-VDI
         Fire     STK-2026-050 · 1 Tem  · seramik kırılması 18 m² · D-VDI
         Sayım    STK-2026-018 · 12 Nis · bahar dönem sayımı düzeltmesi · D-MRK
       Seri son numara ~052. Yıl ortası sayımı HENÜZ YAPILMADI — görev havuzu #4
       "Merkez depo yıl ortası sayım planı" (termin 9 Tem) ile tutarlı; 2026'da tek sayım
       düzeltmesi Nisan kaydıdır.
     · TEDARİKÇİLER (6 TDR; performans skorları pinli — Ege %96 · Trakya %88 · Delta %71):
         TDR-01 Ege Hazır Beton       · Beton            · Kadir Solmaz 0536 218 77 41 · %96 · aktif SIP-07 · cari ₺54.900 alacaklı (cari-durum hareketleriyle BİREBİR: 39.000+35.900−20.000)
         TDR-02 Trakya Beton Santrali · Beton            · %88 — 12 May sevkiyatında 3 gün gecikme kaydı skora yansıdı (doc kabul kriteri) · aktif SIP-06 · cari ₺0 (dönem kapalı)
         TDR-03 Marmara Demir Çelik   · Demir & Çelik    · Burcu İnan 0212 466 90 23 · %91 · aktif SIP-05 kısmi (−0,4t açık) · cari ₺211.000 alacaklı (FTR-09 kontrolde, cariye işlenmedi)
         TDR-04 Boğaziçi Yapı Market  · Yapı Market & Doğrama · %94 · FTR-06 vade 15 Tem · cari satırı cari-durum'da YOK → D14 senkron devri (kartta bakiye ₺418.200 gösterilir, "muhasebe ödeme planında" notu)
         TDR-05 Delta Elektrik        · Elektrik         · %71 WARN — SIP-04 8 gün AKTİF termin gecikmesi + 14 Nis teslimatında 5 gün gecikme (2 kayıt; D13 risk uyarısı kaynağı)
         TDR-06 Anadolu Hırdavat      · Hırdavat & Sarf  · Fatih Coşkun 0216 349 82 17 · %97 · cari ₺9.850 alacaklı (cari-durum BİREBİR)
       Kayıt-dışı teklifçi idiyomu: SAT-2026-018 icmalindeki Deta Demir Çelik · Nokta
       Hırdavat · Marmara Yapı Market kartsız TEK-SEFER teklifçidir — tedarikçi listesi
       6'da SABİT, icmal ekranındaki bu adlara kart linki VERİLMEZ.
       Cari sekmesi linki: crm-cari-durum.html (liste; ?cari= genişletmesi YAPILMAZ).
     · TAŞERON KARTLARI (K9 — 3 TAS; hakediş ekranı İŞLEM listesi olarak AYNEN kalır,
       kart = KİMLİK/performans; personel sayısı = yemekhane kişi sayısı = 5C kanonik
       firma kadroları 10/6/8 BİREBİR):
         TAS-01 Demir-Beton İnş. Ltd. · Vadi  · betonarme kalıp + demir işçiliği · SZL-2025-T05 ·
           personel 10 · yemekhane 10 · ekipman: kalıp-iskele sistemi + 2 kırıcı-delici ·
           İSG UYARISI: ISG-2026-008 iskele korkuluk eksikliği B Blok (aksiyon bekliyor —
           crm-santiye-isg-detay.html linkli) · HAKEDİŞ İHTİLAFI: TH-2026-014 ₺90.000
           Haziran hakedişinde metraj itirazı (gönderildi 28 Haz, bekliyor; ödeme BLOKE) ·
           6 kriter: süre ok · kalite ok · hakediş ihtilafı WARN · İSG WARN · gecikme ok · teslim ok ·
           cari: crm-cari-detay.html (parametresiz default Demir-Beton — birebir eşleşme)
         TAS-02 ElektroMek Taahhüt    · Vadi  · elektrik tesisat taahhüdü · SZL-2025-T07 ·
           personel 6 · yemekhane 6 · TH-2026-009 ₺76.200 bekliyor + TH-2026-002 ödendi ·
           6 kriter temiz · cari ₺76.200 alacaklı (cari-durum BİREBİR)
         TAS-03 Yalıtım Kardeşler     · Liman · ısı/su yalıtımı + çatı kaplama · SZL-2025-T06 ·
           personel 8 · yemekhane 8 · TH-2026-008 ₺128.500 onaylandı (malzeme mahsuplu) ·
           6 kriter temiz, kalite yüksek · cari: cari-durum'daki yalitim-kardesler kaydıyla senkron
     · PROJE BÜTÇELERİ (3 bütçe; 15 kategori: Hafriyat & Zemin İşleri · Betonarme (Kaba
       Yapı) · Çatı & İzolasyon · Duvar & Sıva · Mekanik Tesisat · Elektrik Tesisatı ·
       İnce İşler & Boya · Doğrama & Cephe · Zemin Kaplama & Seramik · Peyzaj & Çevre
       Düzenleme · Şantiye Genel Giderleri · İşçilik (Puantaj) · Makine & Ekipman ·
       Nakliye & Lojistik · Resmi Giderler & Harçlar):
         Vadi Konakları : orijinal ₺176.500.000 → BTC-2026-R1 (15 Mar; demir fiyat artışı
           +%8 → Betonarme +₺5.200.000) → BTC-2026-R2 (28 May; kapsam — çevre düzenleme
           genişlemesi, Peyzaj +₺2.300.000) → REVİZE ₺184.000.000 · gerçekleşen
           ₺127.400.000 (%69; fiziksel %68 ile tutarlı) · kalan ₺56.600.000
         Liman Lojistik : ₺97.000.000 · revizyon yok · gerçekleşen ₺40.700.000 (%42; fiziksel %41)
         Merkez Şantiye : ₺61.000.000 · revizyon yok · gerçekleşen ₺53.100.000 (%87; fiziksel %86)
       BETONARME AŞIMI (doc kabul kriteri; D13 risk uyarısı): VK Betonarme orijinal
       ₺36.300.000 → R1 revize ₺41.500.000 → gerçekleşen ₺43.160.000 = %104 AŞIM (danger).
       Diğer 14 kategori dağılımını butce-detay üretir — kategori toplamları proje pinli
       toplamlarına OTURUR (uydurma serbest, toplam sabit).
     · GERÇEKLEŞEN MALİYET (proje filtreli; VK default): VK ₺127.400.000 kaynak kırılımı —
       satın alma %41 ₺52.234.000 (SIP-/SAT- linkli) · taşeron hakedişi %28 ₺35.672.000
       (TH- linkli) · işçilik %14 ₺17.836.000 (puantaj) · kasa %9 ₺11.466.000 (KSA- linkli) ·
       stok sarfı %5 ₺6.370.000 (STK- linkli) · genel %3 ₺3.822.000. Pinli kaynak satır
       örnekleri: SIP-2026-05 ₺2,84M · TH-2026-013 ₺210.000 · KSA-2026-021 · STK-2026-052.
       Menü cnt Gerçekleşen Maliyet 1 = Betonarme aşım uyarısı.
       crm-panel-rapor-maliyet.html RAPOR olarak kalır + bu ekrana "Detaylı ekran →" linki
       alır (K13 — tek hedefli edit, T3).
     · NAKİT AKIŞI (şirket geneli ↔ proje toggle; bugün 2 Tem 2026):
       Başlangıç likidite ₺5.430.130 = banka ₺5.265.000 (Garanti ₺2.980.000 · Akbank
       ₺1.640.000 · Ziraat ₺645.000 — firma IBAN üçlüsüyle eş) + şantiye kasaları ₺165.130
       (D8 kanonik TOPLAM KASA BİREBİR).
       KPI şeridi (kümülatif NET akış; başlangıç 0): 7 gün +₺670.000 · 30 gün +₺710.000 ·
       60 gün −₺2.990.000 (DANGER dip — FTR-2026-09 ₺2,84M vadesi 27 Ağu + 28 Ağu bordro) ·
       90 gün −₺465.000 (warn; toparlanma: GE2 lansman kapora beklentisi).
       Maaş günü kanoniği: aylık bordro ₺3.400.000 her ayın 28'i (idari 22 + öz saha 69).
       TAHSİLAT TAKVİMİ (pinli satırlar; ODP-/HKD- belgeye linkli):
         GECİKMİŞ · Toprak SSZ-2026-004 5. taksit ₺570.000 — vade 20 Haz, 12 GÜN GECİKME
           (danger; D11/D13 senkron) · tahsilat girişimi 10 Tem
         8 Tem  · HKD-2026-003 Aliağa ₺980.000 (onaylandı — ödeme bildirimi alındı)
         15 Tem · Onaran SSZ-2026-003 15. taksit ₺115.000 (aylık seri: 15 Ağu, 15 Eyl…)
         20 Tem · Toprak 6. taksit ₺570.000 (aylık seri: 20 Ağu, 20 Eyl…)
         25 Tem · Şahinoğlu ODP-2026-001 peşinat ₺1.485.000 (opsiyon→sözleşme; "beklenen" rozeti)
         28 Tem · HKD-2026-006 Körfez ₺1.630.000 (gönderildi — onay+tahsilat beklenen)
         18 Ağu · Aliağa Temmuz hakedişi ₺1.050.000 (beklenen) · 20 Ağu · Körfez Temmuz
           hakedişi ₺1.700.000 (beklenen) · Eyl: Körfez+Aliağa Ağustos hakedişleri
           ₺2.750.000 (beklenen) · Eyl sonu: GE2 lansman kapora beklentisi ₺4.200.000
           (12 opsiyonlu ön-talep; "beklenen" rozeti — projeksiyon satırı)
       ÖDEME TAKVİMİ (pinli satırlar; TH-/FTR- belgeye linkli):
         8 Tem  · TH-2026-013 Demir-Beton ₺210.000 · 10 Tem · TH-2026-008 Yalıtım ₺128.500
         15 Tem · FTR-2026-06 Boğaziçi ₺418.200
         28 Tem/28 Ağu/28 Eyl · bordro ₺3.400.000
         27 Ağu · FTR-2026-09 Marmara ₺2.840.000 (60 gün dip sürücüsü)
         Eyl ortası · Trakya SIP-06 faturası ₺798.000 (teslim sonrası beklenen vade)
         TH-2026-014 ₺90.000 İHTİLAFLI — tarih ATANMAZ, "bloke" rozetiyle listelenir
         haftalık şantiye kasa beslemeleri ~₺100–150K (KSG idiyomu, "planlı" satır)
       Haftalık akış tablosu (giren/çıkan/kümülatif) bu satırlardan DERİLİR ve pinli KPI
       dörtlüsüne OTURUR (ara haftalar T3 türetmesi — toplamlar sabit, negatif .danger).
     · Menü cnt özeti (D12): Siparişler 5 · İrsaliye & Fatura 1 · Stok & Depo 3 ·
       Gerçekleşen Maliyet 1. ROLES delta: muhasebe.secs += satinalma
       (scr:[siparisler,irsaliye,stok,tedarikciler]) · teknik.secs += satinalma (scr:[stok])
       + finans scr'ye iner [kurum,taseron,sozlesmeler,butce,maliyet,taseronlar] (nakit YOK) ·
       sef.secs += finans (scr:[taseronlar] — kendi şantiyesi salt-okunur) + sef.scr.satinalma
       = [talepler,formlar,siparisler,termin,irsaliye,stok] (tedarikçi YOK; sipariş/irsaliye
       kendi şantiyesi görüntüleme). MENÜ UNLOCK KURALI: yeni menü kalemleri ancak 14 dosya
       diskte varken eklenir (ölü link yasağı).
   ─ DALGA 13 KANONİK TANIMLAR (2026-07-11 — yönetici paneli + müşteri portalı + gavia
       platform konsolu + süpürme finali; D14 tutarlılık kapanışı AYRI dalga):
     · YÖNETİCİ PANELİ (crm-panel-yonetici.html — panel menüsü Analiz grubu, screen:'yonetici';
       YALNIZ superadmin+sahip+yonetim görür): teknik/sef/muhasebe/ik rollerine D13'te panel
       scr'si TANIMLANDI [panel,ozet,ajanda,onaylar,bildirimler,raporlar] — görünen set
       DEĞİŞMEDİ (tüm crm-panel-rapor-* sayfaları data-screen="raporlar"), yalnız yonetici
       dışarıda; satinalma/personel/satistemsilci/satismudur'un mevcut panel scr'si zaten
       yonetici'yi dışlar. 10 panel: Genel · Satış Hunisi · Bağımsız Bölüm Stoku · Bütçe ·
       Finans/Nakit · Satın Alma · Stok & Depo · Hakediş · Taşeron · Risk Uyarıları — TÜM
       sayılar kaynak sayfalarla BİREBİR (satış D11 · bütçe/maliyet/stok/nakit/tedarik D12
       kanonikleri; yeni tutar UYDURULMAZ), her panel "tümü →" linkli.
       RİSK UYARILARI (3 — kaynaklarla senkron): Betonarme %104 AŞIM (revize ₺41.500.000 →
       gerçekleşen ₺43.160.000; butce-detay/maliyet) · Derya Toprak SSZ-2026-004 5. taksit
       ₺570.000 vade 20 Haz — 12 GÜN GECİKME (nakit/cari/sözleşme-detay) · Delta Elektrik
       SIP-2026-04 ₺734.600 termin 24 Haz — 8 GÜN GECİKME (siparisler/tedarikci-detay).
     · MÜŞTERİ PORTALI (portal-panel / portal-odemeler / portal-belgeler / portal-talepler
       .html — 4 sayfa, STANDALONE: shell.js YOK, rail YOK, rol motoru DIŞI; açık zeminli
       hafif topbar [Yapıtaş markı + "Müşteri Portalı" + Selçuk Onaran çipi] + 4 sekme nav;
       MOBİL ÖNCELİKLİ; tokens.css+ui.css üstüne sayfa-içi stil — YENİ CSS DOSYASI YOK).
       Demo müşteri: Selçuk Onaran (MST-2026-001 · CAR-2026-021 · Onaran Holding yönetim
       kurulu üyesi idiomu müşteri-detay'dan):
         KO-B-304: SSZ-2025-042 imzalı → TSL-2026-001 TESLİM EDİLDİ (Mart 2026) — ödemesi kapalı.
         VK-C-18: SSZ-2026-003 imzalı ₺6.120.000 = peşinat ₺918.000 (%15) + 36 × ₺115.000
           (her ayın 15'i) + teslimde ₺1.062.000 · 14/36 taksit ÖDENDİ (ödenen ₺2.528.000 =
           peşinat + 14 taksit) · KALAN ₺3.592.000 (cari + sözleşme-detay + müşteri-detay
           BİREBİR) · SIRADAKİ 15. taksit VADE 15 TEM 2026 (nakit akışı tahsilat takvimi BİREBİR).
       MAKBUZ idiomu: MKB-2026-0## tahsilat makbuzu (yalnız portal belgelerinde görünür;
       en yeni MKB-2026-014 = 15 Haz 2026, 14. taksit ₺115.000). Belge seti: SSZ-2025-042 ·
       SSZ-2026-003 · TSL-2026-001 · ODP ödeme planı çıktısı · 14 taksit makbuzu.
       Portal talepleri crm-satis-talepler ile ÇİFT YÖNLÜ TUTARLI: SST-2026-007 klima drenaj
       (garanti) + SST-2026-010 taksit planı dökümü (bilgi) — tür/durum/tarih satış
       tarafındaki kayıtlarla BİREBİR; portalda "Yeni Talep" formu tür seçimli (mock, kayıt
       localStorage'a YAZMAZ).
     · GAVIA PLATFORM KONSOLU (gavia-panel / gavia-firmalar / gavia-firma-detay /
       gavia-firma-form / gavia-paketler .html — 5 sayfa, STANDALONE kiosk emsali: shell.js
       YOK, kendi DARK topbar'ı [Gaviaworks "G" markı + "Platform Konsolu" + Deniz Aksoy
       çipi] + yatay sekme nav [Genel Bakış · Firmalar · Paketler]; YALNIZ superadmin —
       sayfa-içi guard: ?role → localStorage(gv_crm_role) → superadmin DEĞİLSE
       location.replace('index.html')).
       PAKETLER (4 + Ücretsiz; aylık): Ücretsiz ₺0 · Basic ₺7.900 · Professional ₺14.900 ·
       Saha + Satış ₺19.900 · Enterprise ₺34.900. Limit/modül matrisi:
         Ücretsiz     : 3 kullanıcı · 1 şantiye · 1 GB · SMS yok · Şantiye & Saha + Görev Takibi
         Basic        : 10 kullanıcı · 2 şantiye · 10 GB · 1.000 SMS · + Personel & İK + Saha Kayıtları
         Professional : 25 kullanıcı · 5 şantiye · 50 GB · 5.000 SMS · + Satın Alma + Cariler +
           Hakediş & Sözleşme (7 modül — Yapıtaş plan-card/limitleriyle BİREBİR)
         Saha + Satış  : 40 kullanıcı · 8 şantiye · 100 GB · 10.000 SMS · + Satış ve fırsat + Müşteri Portalı
         Enterprise   : sınırsız kullanıcı/şantiye · 500 GB · 25.000 SMS · + Stok & ERP +
           Çoklu Firma Yönetimi + öncelikli destek
       TENANT'LAR (5 ana + Miray 2 alt şirket; MRR ₺61.700 = 14.900 + 26.900 + 19.900 —
       deneme ve ücretsiz ₺0):
         Yapıtaş İnşaat A.Ş. · Professional ₺14.900 · Aktif 14 ay · 18/25 kullanıcı · 3/5
           şantiye · toplam ödeme ₺208.600 (dönemsel fiyat farkı + ek paketler dahil; kırılım
           gösterilmez) · son faturalar Tem/Haz ₺14.900 + May ₺13.400 (crm-ayarlar-firma
           BİREBİR) · 3 genişleme modülü (Satış ve fırsat · Stok & ERP · Çoklu Firma) TANITIM
           EKLENTİSİ olarak AÇIK (₺0 — moduller sayfası 10/10 senkron; MRR'a eklenmez)
         Miray Yapı Group · Enterprise · Aktif 26 ay · ESKİ FİYAT GARANTİSİ ₺26.900/ay (2024
           sözleşmesi; liste ₺34.900) · MULTI-COMPANY: alt şirketler ana sözleşmeye DAHİL,
           ayrı fatura YOK — Miray Konut A.Ş. (Enterprise rozeti) + Miray Altyapı Ltd.
           (Basic rozeti) · tek yetkili Cem Miray — 3 şirkete erişim · kullanıcı 42 (24+12+6) ·
           toplam ödeme ₺699.400 (26 × 26.900)
         Ege Modern İnşaat · Saha + Satış ₺19.900 · Aktif 7 ay · 11/40 kullanıcı · toplam
           ödeme ₺139.300 · satış ofisi ağırlıklı geliştirici
         Kuzey Proje Ltd. · Basic DENEME (9/14. gün — başlangıç 24 Haz, bitiş 8 Tem 2026) ·
           ₺0 · 4 kullanıcı · "Deneme Sürecini Başlat" akışının sonucu
         Çınar İnşaat · Ücretsiz ₺0 · Aktif 2 ay (May 2026) · 3 kullanıcı
       Platform KPI seti: firma 5 (+2 alt şirket) · MRR ₺61.700 · aktif deneme 1 · toplam
       kullanıcı 78 (18+42+11+4+3). gavia-firma-detay ?firma= map: yapitas (DEFAULT) ·
       miray · ege · kuzey · cinar; Genel sekmesi = crm-ayarlar-firma alan setinin YAPISAL
       İKİZİ (DALGA 10 kanonik bloğu — alanlar BİREBİR, salt-okunur platform görünümü).
       "Deneme Sürecini Başlat" CTA'sı gvToast sim (yeni tenant açmaz).
     · SÜPÜRME FİNALİ (1.13 kapanış): tenant-chip "Firma değiştir" → gavia-firmalar.html
       GERÇEK LİNK (kilit + toast KALKTI) · Ayarlar > Modüller 3 genişleme toggle'ı GERÇEK
       ve AÇIK (10/10 aktif; "tanıtım eklentisi" notu) · index: Müşteri Portalı demo giriş
       kartı + superadmin kartına Platform Konsolu linki. Repo genelinde placeholder
       kalıntısı 0 hedefi (grep denetimi dalga sonu QA'da).
   ─ DALGA 17 KANONİK TANIMLAR (2026-07-14 — yönlendirme çekirdeği: kayıt kimliklendirme +
       gv-pager + bulunamadı-kartı; kaynak: D17 denetim planı + DK1-DK12 kararları):
     · YENİ KANONİK (DK10 — Beyar direktifi): İSG-008 tek-link emsali İPTAL. Kural artık
       "HER kayıt referansı kimlikli linke gider." D14'te düz-metne çevrilen MLZ-2026-032/033
       bu dalgada ?mlz= ile YENİDEN linklenir; SZL-T06/T07 → ?szl= D18'de (Y9).
     · PARAM ANAHTAR KONVANSİYONU (D12 param↔map dersi + Ç3): param adları kısa Türkçe-ASCII
       (?gorev= ?mlz= ?izn= ?avn=), DEĞERLER kısa-form SADECE numara ("008", "046", "031") —
       belge önekinin tamamı DEĞİL. Türkçe karakter param'a girmez (İZN → izn). Hedef sayfa
       normalize eder: küçük harf + "MLZ-2026-046"/"izn-031" gibi uzun formdan son 3 haneyi
       soyar (sessiz default'a düşme YASAK — bkz. bulunamadı kuralı).
     · GEÇERSİZ PARAM KURALI (DK3): param VAR ama map'te YOKSA gvNotFound(...) kartı
       (ui.js — "Kayıt bulunamadı" + listeye dön + varsayılan kaydı aç aksiyonları;
       mount: main.gv-main). Param HİÇ YOKSA eski davranış: DEFAULT kayda düşer
       (ALTIN KURAL — menü linkleri ölü ekrana düşmez).
     · GRV-2026-0## GÖREV KODU SERİSİ (YENİ — 26 kayıt; numara = crm-gorev.html DOM sırası;
       eski "Görev #VK-118" yazımı KALKAR → GRV-2026-008; detay ?gorev=0## map,
       parametresiz DEFAULT 008; kod liste satırlarında ve detay eyebrow'unda GÖRÜNÜR):
       Bana Verilenler (001-007):
         001 Ø12 demir talebinin teslim tarihini teyit et      · Vadi   · MD→Hasan Demirci · 10 Tem · yüksek · devam
         002 A Blok elektrik şaft kontrolü — ElektroMek ile    · Vadi   · MD→Hasan Demirci · 3 Tem  · orta   · devam
         003 Vinç bakım planını revize et                      · Liman  · MD→Aylin Koç     · 5 Tem  · yüksek · devam
         004 Çatı paneli montaj ekibini planla                 · Merkez · ES→Ömer Taşkın   · 6 Tem  · orta   · devam
         005 Haftalık İSG turu                                 · Merkez · MD→Ömer Taşkın   · 4 Tem  · düşük  · başlamadı
         006 Kalıp kereste stok sayımı                         · Vadi   · HD→Ali Vural     · 8 Tem  · orta   · devam
         007 Puantaj defterini güncelle                        · Vadi   · HD→Ali Vural     · 3 Tem  · düşük  · devam
       Gecikenler (008-010):
         008 Perde betonu kür takibini raporla  [DEFAULT]      · Vadi   · MD→Hasan Demirci · 1 Tem GEÇTİ  · yüksek · gecikti
         009 Kalıp iskelesi söküm onayını al                   · Liman  · MD→Aylin Koç     · 30 Haz GEÇTİ · yüksek · gecikti
         010 Haziran kasa mutabakatını tamamla                 · —      · MD→Nesrin Aydın  · 30 Haz GEÇTİ · orta   · gecikti
       Verdiklerim (011-015):
         011 Aylık ilerleme raporunu hazırla                   · Vadi   · MD→Hasan Demirci · 9 Tem  · orta   · devam
         012 Malzeme talep onay sürecini hızlandır             · Liman  · MD→Baran Yıldız  · 6 Tem  · yüksek · devam
         013 Yeni personel oryantasyon planı hazırla           · Merkez · MD→Seda Karaca   · 12 Tem · düşük  · başlamadı
         014 Temmuz hakediş taslağını gözden geçir             · —      · MD→Nesrin Aydın  · 15 Tem · yüksek · devam
         015 Vinç kiralama sözleşmesini incele                 · Liman  · MD→Aylin Koç     · 7 Tem  · orta   · devam
       Tamamlananlar (016-020):
         016 Haftalık İSG turu                                 · Vadi   · MD→Hasan Demirci · 1 Tem  · tamamlandı
         017 Avans ödemelerini banka listesine aktar           · —      · MD→Nesrin Aydın  · 1 Tem  · tamamlandı
         018 Çatı paneli sevkiyatı teslim alma kaydı           · Merkez · ES→Ömer Taşkın   · 30 Haz · tamamlandı
         019 Haftalık İSG turu                                 · Merkez · MD→Ömer Taşkın   · 28 Haz · tamamlandı
         020 Kalıp kereste stok sayımı ön kontrolü             · Vadi   · HD→Ali Vural     · 29 Haz · tamamlandı
       Havuz (021-026 — D8 kanonik havuz listesi BİREBİR + 030-031 — Dalga 20 /
       T-GOREV-02 eki, İK ve Yönetim havuzlarını doldurur (önceden boştu); bırakan
       Kemal Yapıcıoğlu; data-claim slug'ları AYNEN kalır, claim mekanizmasına DOKUNULMAZ):
         021 Liman Lojistik çevre aydınlatma keşfi             (liman-cevre-aydinlatma-kesfi) · 8 Tem  · orta
         022 Kule Ofis kesin hesap dosyası kontrolü            (kule-kesin-hesap-kontrolu)    · 6 Tem  · yüksek
         023 Vadi Konakları numune daire fotoğraf çekimi       (vadi-numune-daire-fotograf)   · 10 Tem · düşük
         024 Merkez depo yıl ortası sayım planı                (merkez-yil-ortasi-sayim)      · 9 Tem  · orta
         025 Göl Evleri 2. Etap ruhsat evrak listesi           (gol-evleri-ruhsat-evrak)      · 1 Tem GEÇTİ · yüksek
         026 Şantiye araç takip çizelgesi güncelleme           (arac-takip-cizelgesi)         · 12 Tem · düşük
         030 Merkez Şantiye personel özlük evrak eksik kontrolü (merkez-ozluk-evrak-kontrolu)        · 11 Tem · orta   · İK havuzu
         031 Göl Evleri 2. Etap yatırım komitesi sunum hazırlığı (gol-evleri-yatirim-komitesi-sunumu) · 7 Tem  · yüksek · Yönetim havuzu
       Havuz görünümü kayıttan türer (durum=havuzda → pool şeridi + havuz atama kartı);
       ?pool=1 ESKİ paramı: gorev'siz gelirse ?gorev=021'e eşdeğer davranır (ölü link yasağı),
       tüm iç linkler ?gorev='e çevrilir. Not: 3× "Haftalık İSG turu" (005/016/019) ve
       benzer başlıklar kodla ayrışır — link hedefi HER ZAMAN koddan, başlık metninden değil.
       Seri durumu (Dalga 20 güncellemesi — önceki "001-026 dolu, 027+ REZERVE" notu
       kısmen ESKİDİ): 001-026 dolu (D8/D17) · 027-029 D-Dalga4'te 8-durum örneklemesi
       için GERÇEK kayıt olarak açıldı (Onay Bekliyor/Revize İstendi/İptal Edildi —
       "kayıt AÇILMAZ" notu bu 3 kayıt için GEÇERSİZ oldu) · 030-031 bu dalgada
       (T-GOREV-02) İK/Yönetim havuzu için GERÇEK kayıt olarak açıldı. Sıradaki 032+
       yine REZERVE — gorev-form "yeni görev" numarası üretmez, kayıt AÇILMAZ.
     · ?mlz= MAP EVRENİ (MLZ-2026-030..046 = 17 kayıt; talepler LİSTESİ 034-046'da SABİT
       kalır — evren numaraları DEĞİŞMEZ, rezerveler aynen):
         030 mekanik tesisat paketi (Vadi, Tedarik Sürecinde, SAT-018 icmal) = DEFAULT
             (parametresiz eski davranış birebir) · 031 Vadi betonarme demir (arşiv,
             SIP-05 zinciri) · 032 Vadi PVC doğrama → SAT-009 (arşiv) · 033 Liman kaynak
             teli + gaz tüpü → SAT-010 (arşiv) · 034-046 talepler listesindeki 13 kayıt
             (liste alanları kanonik; detay içerikleri T2 üretir — kalem/tarih/zincir
             liste satırı + varsa panel/onay/rapor atıflarıyla ÇELİŞEMEZ).
       Arşiv kayıtlar (031/032/033) detayda "Arşiv talep" rozetiyle açılır; bunlara
       liste satırı EKLENMEZ. formlar.html 032/033 düz-metinleri LİNKE döner (DK10).
     · İZİN/AVANS AYRI DETAY EKRANLARI (DK1 — Seçenek A; dizin +2 → 136 ekran):
       crm-personel-izin-detay.html?izn=  (map: 027..031; DEFAULT 031 — İZN-2026-031 Ali Vural)
       crm-personel-avans-detay.html?avn= (map: 011..015; DEFAULT 014 — AVN-2026-014 Ali Vural ₺4.000)
       Liste master-detail panelleri HIZLI-BAKIŞ olarak KALIR (onay aksiyonları dahil);
       panele "Detayı aç →" linki eklenir; liste satır tıklaması panel seçimi olarak sürer
       (detaya gitmez), detaya götüren şey panel linki + satır kod linkidir. Panel/onaylar/
       ozet/rapor/ajanda köprüleri doğrudan ?izn=/?avn= detayına kimliklenir.
     · gv-pager KOMPONENTİ (DK11 kilit istisnası — ui.js+ui.css, T0):
       Bağlama: tabloya/konteynere data-paginate="25" (satır kaynağı: tbody tr; tablo-dışı
       için data-paginate-rows="selector"). ui.js wireTables otomatik kurar; JS-render
       sayfalar satırları bastıktan sonra gvPager(el) çağırır. Filtreyle iş bölümü:
       filtre motoru tr.hidden yazar (mevcut idiyom), pager YALNIZ filtre-görünür satırları
       .gv-pg-hide ile sayfalara böler — iki eksen çakışmaz. Sayfa-lokal filtre motoru olan
       ekranlar filtre sonrası gvPagerRefresh(el) çağırır; ui.js applyFilters bunu kendisi yapar.
       Kurallar (RB §5 statik alt kümesi): kayıt ≤ pageSize → pager kendini GİZLER ·
       filtre/arama değişince page=1 · geçersiz/aşkın ?page → son sayfaya kelepçe ·
       toplam kayıt sayacı görünür ("1–25 · 196 kayıt") · ?page= URL'e replaceState ile
       yazılır/okunur · mobil kompakt görünüm. Her refresh konteynerde 'gvpage' event'i
       yayar (gün-başlıklı listeler senkron için — log idiyomu).
       PageSize kanoniği: 25 (tüm listeler). D17 pilotları: birimler · kullanıcılar ·
       personel · ayarlar-log (T0). Kalan entegrasyonlar D18.
     · URL-STATE STANDARDI (Y6): ?f= (chip) & ?q= (arama) & ?page= — ui.js merkezi yazar
       (replaceState; arama debounce'lu). Yüklemede ?q= arama kutusuna, ?f= YALNIZ birebir
       eşleşen data-filter chip'i varsa uygulanır (crm-gorev'in görünüm-?f='i sayfa-lokal
       kalır, çakışmaz). Detay sekmeleri #hash idiyomunda sürer (D13).
     · PANEL KART KURALI (Y4): KPI/sayaç kartları <a class="kpi-card" href="filtreli-liste">
       olur (ui.css a.kpi-card dokunuşu); başlık linkleri kayıt kimliğine, "Tümü" filtreli
       listeye, onay aksiyonları modala — RB §3.4 beşlisi. Kiosk (crm-panel-operasyon.html)
       DOKUNULMAZ (D15 kanoniği).
     · Y15 (DK12): kredikarti "Tümünü Göster" karosu KALDIRILDI — banka sıfırlama "Tümü"
       chip'inde; kart şeridi salt seçici. şef dalı ve syncBankaUI chip senkronu AYNEN.
     · Y12 (DK6): 4 portal sayfasına noindex eklendi (132→136/136) + robots.txt (Disallow /)
       + 404.html (index dark idiyomu; giriş + dizin aksiyonlu).
   ─ DALGA 18 KANONİK TANIMLAR (2026-07-15 — kimliklendirme finali Y9/Y10 + Y7/Y17 yayılımı;
       kaynak: D18 iç planı + DK1-DK12 + Beyar 15 Tem kararları. Param/geçersiz-param/ölü-link
       kuralları DALGA 17 bloğundakiyle AYNI: kısa ASCII param + kısa değer, tanınmayan param →
       gvNotFound kartı, parametresiz → DEFAULT, ALTIN KURAL "menü linki ölü ekrana düşmez"):
     · TEMSİLİ DERİNLİK KURALI (Beyar onaylı): çok-kayıtlı detay dönüşümlerinde TÜM kayıtlar
       kimlikli + liste-satırı alanlarıyla map'e girer; ZENGİN sekme/blok içerikleri yalnız
       temsili kayıtlarda dolu olur. Sekme içerikleri UYDURULMAZ — yalnız mevcut kanonik
       çapraz kayıtlardan derlenir (izin/avans listeleri, GRV blok, ZMT envanteri, ozluk
       12-matrisi, kasa/hakediş atıfları); çapraz kaydı olmayan kişide tasarlanmış boş durum.
     · SAT-2026-010 UZLAŞTIRMA (Beyar 15 Tem; D17 devri kapanır): KANONİK = D12 anlatısı —
       Anadolu Hırdavat (TDR-06) · 5 May sipariş / 9 May teslim · SIP-2026-02 zinciri ·
       IRS-2026-04 + FTR-2026-04 · ₺96.400 ödendi (siparis-detay:222-239 + DALGA 17 ?mlz=033).
       ÇELİŞEN yüzeyler hizalanır: formlar.html:174-180 (tedarikçi/tarih/tutar), termin.html:156,
       rapor-talep.html:350, talep-detay.html:224,228 (onay tarihi dahil). Kalem adı
       "Kaynak teli + gaz tüpü" SABİT kalır.
     · ?santiye= ŞANTİYE DETAY MAP (crm-santiye-detay.html; anahtarlar listedeki data-site
       BİREBİR): vadi [DEFAULT — mevcut hardcode Vadi Konakları] · liman · merkez · gol · kule.
       Liste 5 satırı + panel/rapor köprüleri kimliklenir. gol (%0 Planlama) ve kule (%100
       Teslim) sekme içerikleri temsili-derinlik kuralına tabi (uydurma iş programı YOK —
       durum kartı + tasarlanmış boş sekmeler). DİKKAT: ?santiye= başka sayfalarda SCOPE
       paramı (kasa/puantaj/isprogrami) — davranış değişmez, yalnız detay sayfası kayıt seçer.
     · ?isg= MAP (crm-santiye-isg-detay.html; kaynak: crm-santiye-isg.html KAYITLAR dizisi
       :171-183 BİREBİR, 11 kayıt 001-011): DEFAULT 008 (mevcut hardcode, "KAYITLAR[3]
       BİREBİR" yorumu korunur). Liste 11 satırın TAMAMI linklenir (DK10 — tek-temsili
       gerekçe yorumu :187-191 KALKAR). Tür/durum/şantiye alanları dizideki değerlerle.
     · ?ks= KASA RAPOR MAP (crm-operasyon-kasa-detay.html; kaynak: kasa #tblKasa 16 kayıt):
       değer slug "ksa-018"/"ksg-004" (İKİ seri tek tabloda — çıplak numara belirsiz).
       DEFAULT ksa-018 (mevcut hardcode KSA-2026-018). BİLİNEN TUTARSIZLIK ÇÖZÜMÜ: detayın
       kalem dökümü liste tutarına (₺24.900) HİZALANIR — liste kanonik. KSG kayıtları
       giriş/tahsilat tipli detay şablonu alır (KSG-004→HKD-2026-005, KSG-002→HKD-2026-004
       çapraz linkleri ?hkd= ile). KSA-022 TASLAK → kasa-form'a linkli KALIR (detay açılmaz).
       Dış köprü süpürmesi (panel/onaylar/bildirimler/ozet/log/santiye-detay düz metinleri)
       ?ks= linkine döner.
     · ?ymk= MAP (crm-operasyon-yemekhane-sayim-detay.html; kaynak: SAYIMLAR :355-360):
       001-004 (218/225/220/223) · DEFAULT 004 (mevcut hardcode). Liste 4 satırın tamamı
       linklenir (linkli:true bayrağı kalkar, hepsi linkli).
     · SBL-2026-0## SAHA BİLDİRİM SERİSİ (YENİ — kayıt no'suz 8 karta ID atanır; numara =
       crm-santiye-bildirimler.html DOM sırası) + YENİ SAYFA crm-santiye-bildirim-detay.html?bil=
       (İSG-detay emsali; dizin +1):
         001 H.Demirci Vadi 2 Tem 09:40 Yapı İlerlemesi "B Blok temel betonu…" Yeni [DEFAULT]
         002 İ.Sönmez  Vadi 2 Tem 08:15 Elektrik/Mekanik Yeni
         003 A.Koç     Liman 1 Tem 16:20 Yapı İlerlemesi Yeni
         004 Ş.Aslan   Liman 1 Tem 11:05 İSG Yeni
         005 Ö.Taşkın  Merkez 30 Haz 14:50 Atölye/Depo
         006 R.Yaman   Merkez 30 Haz 10:30 Malzeme Teslimatı
         007 M.Çetin   Liman 29 Haz 09:00 Kalite Kontrol
         008 R.Kılıç   Vadi 28 Haz 15:40 Yapı İlerlemesi
       Ana liste alt başlığı "8 bildirim · 4'ü yeni" DEĞİŞMEZ. santiye-detay saha sekmesindeki
       no'suz 4 kayıt: metni havuzdaki bir kayıtla eşleşen AYNI SBL numarasını alır; eşleşmeyen
       kayıt SBL-2026-009+ olarak seriye LİSTE-DIŞI eklenir (MLZ-031..033 arşiv emsali — ana
       listeye satır EKLENMEZ, sekme görünümü değişmez, detayı açılır).
     · ?per= PERSONEL MAP (crm-personel-detay.html; 22 kayıt, numara = crm-personel.html DOM
       sırası 001-022 → 001 K.Yapıcıoğlu · 002 M.Denizli · 003 E.Sarıkaya · 004 H.Demirci
       [DEFAULT — mevcut hardcode] · 005 A.Koç · 006 Ö.Taşkın · 007 N.Aydın · 008 B.Yıldız ·
       009 S.Karaca · 010 A.Vural · 011 İ.Sönmez · 012 R.Kılıç · 013 S.Doğan · 014 M.Erdem ·
       015 V.Şimşek · 016 Ş.Aslan · 017 H.Güneş · 018 M.Çetin · 019 O.Polat · 020 R.Yaman ·
       021 İ.Kurt · 022 S.Öz). Görünür kod ÜRETİLMEZ (sicil serisi yok; kimlik param'da).
       ZENGİN kayıtlar (temsili 4): 004 Hasan Demirci (mevcut tam içerik AYNEN) · 010 Ali Vural
       (İZN-2026-031 + AVN-2026-014 + RPR-2026-001 + eksik Sağlık Raporu zinciri) · 005 Aylin Koç
       (İzinli durumu + İZN geçmişi + rapor-puantaj bağlamı) · 017 Halil Güneş (İSG eğitimi
       18 gün uyarısı + AVN/İZN çaprazları varsa). Kalan 18: kimlik kartı + liste alanları +
       ozluk 12-matris satırından türeyen evrak özeti; sekmelerde çapraz-kayıt kuralı (üstteki
       temsili-derinlik maddesi). data-admin-only payroll guard'ı HER kayıtta korunur.
       İsim≠hedef düzelen dış köprüler: yemekhane-sayim-detay:179→?per=009 (Seda Karaca),
       isg-detay:233→?per=011 (İ.Sönmez), rapor-puantaj:195→?per=005 (Aylin Koç) vb. —
       köprü İSİMDEKİ kişiye gider, metin değişmez.
     · RPR-2026-0## SAĞLIK RAPORU SERİSİ (YENİ — 4 kayıt, numara = liste DOM sırası) +
       ?rpr= MAP (crm-personel-rapor-detay.html): 001 Ali Vural İstirahat 28 Haz–1 Tem 4g
       Kartal DH "SGK'ya bildirildi" [DEFAULT — mevcut hardcode] · 002 Selim Doğan İstirahat
       10–11 Haz 2g Kartal DH Tamamlandı · 003 Ömer Taşkın Sağlık Kurulu 15–16 Haz 2g Gebze DH
       Tamamlandı · 004 Nesrin Aydın İstirahat 22–23 Haz 2g Özel İzmir H. "SGK bildirimi
       bekliyor". Kod liste satırında GÖRÜNÜR olur (GRV modeli); ayarlar-firma kanonik prefiks
       tablosuna "RPR-2026-001 — Sağlık raporu" satırı eklenir (T2).
     · HAKEDİŞ ÇİFT MAP (crm-finans-hakedis-detay.html TEK sayfa, İKİ param kabul eder;
       taseron-detay ?tas= JS DATA map deseni emsal): ?th= → TH-2026-{002,005,008,009,013,014}
       (taşeron; DEFAULT parametresizde th-014 = mevcut hardcode İÇERİK BİREBİR korunur) ·
       ?hkd= → HKD-2026-{001..006} (kurum). HKD detay içerikleri YENİ üretilir: liste alanları
       (kurum.html) + rapor-hakedis envanteri + kasa KSG atıflarıyla (HKD-005 ↔ KSG-004 ₺620.000,
       HKD-004 ↔ KSG-002 ₺540.000) ÇELİŞEMEZ; kesinti şablonu kurum tipinde stopaj/teminat
       taşeron şablonundan FARKLI olabilir — kaynakta olmayan kesinti UYDURULMAZ, brüt=net
       gösterilip "kesinti yok" notu düşülür. taseron.html + kurum.html 12 satır kimliklenir;
       dış köprü süpürmesi (panel/ajanda/onaylar/log/cari-detay/nakit/maliyet düz metinleri)
       ?th=/?hkd= linkine döner. sozlesme-detay İlişkili Hakedişler TH-013/014 ayrı linklere.
     · ?szl= MAP (crm-finans-sozlesme-detay.html; değer data-sozlesme BİREBİR: k01 k02 k03
       t05 t06 t07): DEFAULT t05 (mevcut hardcode SZL-2025-T05). D14 açık deviri #4 KAPANIR:
       DK10 relink — taseronlar:166 (T07) + :194 (T06) düz metinleri ?szl= linkine, taseron-
       detay:236/:260 szlHref:null → ?szl=t07/t06 (yorum :257-259 güncellenir), taseronlar:134
       T05 linki paramlanır. sozlesmeler.html 6 satır kimliklenir.
     · ?form= İCMAL MAP (crm-satinalma-form-detay.html; param adı icmal-cikti.html'in MEVCUT
       ?form= anahtarıyla AYNI — senkron): map 007-014, 016 (liste 9 kaydı) + 018 (phantom;
       listede YOKTUR, liste satırı EKLENMEZ — MLZ-030 zinciri + log + tedarikci-detay
       köprüleriyle erişilir). DEFAULT 018 (mevcut hardcode İÇERİK BİREBİR). 015/017 REZERVE.
       Liste 9 satırı + dış köprüler (SAT-016 zinciri: panel/panel-ajanda/rapor-talep/termin)
       kimliklenir. SAT-010 içeriği ÜSTTEKİ UZLAŞTIRMA maddesine göre üretilir.
     · ?u= KULLANICI DETAY (YENİ SAYFA crm-ayarlar-kullanici-detay.html; dizin +1; DK2):
       değer kebab-slug (?u=kemal-yapicioglu — cari/tas idiyomu), 18 kayıt = kullanicilar.html
       DOM sırası BİREBİR (alanlar: ad, e-posta, rol, kapsam, son giriş, durum). DEFAULT
       kemal-yapicioglu. İçerik: kimlik kartı + rol/yetki özeti (ROLES matrisiyle tutarlı) +
       koltuk bağlamı (18/25) + davet ilişkisi (Selim Doğan Beklemede ↔ davet listesi) +
       [MOCK-SİM] düzenleme formu (kaydetmez, toast). Kullanicilar "Düzenle" butonu ?u=
       linkine döner (Selim Doğan'ın uçak ikonu davet sayfasına). SAYFA superadmin-only
       (mevcut data-view="su-only" aksiyonun devamı — GV.R.scr guard'ı ayarlar bölümünde).
     · ?islem= MASTER-DETAIL PANELLERİ (kredikarti + pluxee, SAYFA İÇİ — yeni sayfa YOK;
       avans master-detail emsali :188-254): satır tıklaması panel seçer, ?islem= deep-link
       replaceState ile yazılır/okunur. Değerler: kredikarti KKR son 3 hane (001-014, DEFAULT
       014 en güncel) · pluxee PLX son 3 hane (039-051, DEFAULT 051). Modül ayrımı dosya
       bazında — çakışma yok. Panel içerikleri satır alanlarından derlenir (uydurma yok);
       şef budaması panel verisinde de geçerli (Garanti dışı kayıt şefte açılmaz).
     · ?log= SATIR-EXPAND (crm-ayarlar-log.html, SAYFA İÇİ): LOG-2026-0803..0834 mevcut
       4-haneli seri; ?log=0834 → ilgili satır expand + vurgu + pager sayfa-atlaması
       (portal-odemeler #tks-next hedef-atlama emsali). Satır href süpürmesi: kasa-detay/
       hakedis-detay/form-detay paramsız linkleri ?ks=/?th=/?hkd=/?form= kimlikli linke
       döner (gorev zaten ?gorev= paramlı — D17).
     · ÖZLÜK ÖNİZLEME PANELİ (crm-personel-ozluk.html, SAYFA İÇİ; DK2): matris hücresi
       tıklanınca alt önizleme paneli (kişi + evrak kategorisi + durum + [MOCK] belge kartı);
       ?evrak= paramı YOK (bilinçli — hücre kimliği kişi×kategori çifti, URL-state şişkinliği;
       panel salt görsel katman). Kişi adı hücreden ?per= detayına linklenir.
     · Y17 MOBİL KART ×4 (DK5; portal-odemeler emsali — ayrı kart DOM'u + data-idx + gvpage
       senkron, data-label DEĞİL): crm-personel (6 kolon) · kasa #tblDefter (7 kolon; devir
       colspan satırı karta "Devir" başlık kartı olarak) · crm-gorev (7 kolon) · talepler
       (7 kolon). ≤640px tablo gizlenir kart listesi açılır; pager state tablodakiyle senkron.
     · Y7 YAYILIMI (gvNotFound — D17'deki 4'e ek 16 dosya): cari-detay, taseron-detay,
       arac-detay, demirbas-detay, siparis-detay, stok-detay, tedarikci-detay, gavia-firma-
       detay + satış 6'lısı (birim/firsat/musteri/sozlesme/talep/teklif-detay) + bu dalganın
       YENİ map'leri (santiye/isg/kasa/ymk/bil/per/rpr/hakedis/szl/form/u). Kural aynı:
       tanınmayan param → gvNotFound; parametresiz → DEFAULT.
     · BREADCRUMB KURALI (Y16 devamı): yeni/dönüşen detay sayfaları kayıt çözülünce
       GV.crumb(kod) çağırır (lokal .gv-crumb İCAT EDİLMEZ); teammate dokunduğu dosyada
       eski lokal .gv-crumb varsa GV.crumb dönüşümünü DAHİL eder (45-dosya envanterinden
       düşülür). Statik sayfada body[data-crumb] alternatifi.
     · DİZİN/MODULLER SENKRONU: +2 YENİ ekran (bildirim-detay + kullanici-detay) →
       mast 136→138; santiye grubu +1, ayarlar grubu +1. Dizin satırları dalga sonunda
       T0 tarafından eklenir (6B kuralı).
   ─ DALGA 19 KANONİK TANIMLAR (2026-07-29 — 29 Tem revize turu, Wave 0 kanonik hazırlık;
       kaynak: 28.07.2026 toplantı notları 9 madde + Beyar karar seti S1-S12.
       YENİ EKRAN AÇILMAZ — dizin 138'de sabit kalır. Wave 1/2 sayfaları BU tanımları kullanır):
     · TAŞERON KALFA KADROSU (madde 5 / S4-S5 — YENİ kanonik varlık; "Traton Yapı" EKLENMEZ,
       kanonik 3 taşeron kullanılır). Kalfa = KİŞİ ve EKİBİN ÜYESİDİR — sahada çalışır,
       puantajda KENDİ satırıyla görünür, ayrıca "kalfa" rol etiketi taşır.
       KORDON KURALI: kalfalar 24 taşeron sayısına DAHİLDİR, üzerine EKLENMEZ
       (aksi hâlde 93 = 69 öz + 24 taşeron kordonu ve yemekhane taşeron payı ₺4.185 kayar).
       5 kalfa, ekip içi dağılım:
         Demir-Beton İnş. Ltd.  → Hüseyin Palabıyık (kalıp kalfası)  · Bekir Sarıoğlu (demir kalfası)
         ElektroMek Taahhüt     → Mustafa Doğanay (elektrik kalfası)
         Yalıtım Kardeşler      → Salih Bingöl (mantolama kalfası)   · Ercan Kavaklı (izolasyon kalfası)
       Personel formunda Firma/Taşeron seçimi kalfa listesini bu eşlemeye göre daraltır.
     · TAŞERON İŞÇİ KADROSU (madde 5+6 — YENİ kanonik ad listesi, 24 kişi = 5C headcount'un
       taşeron ayağı; kişi bazlı puantajın ad kaynağı. Kalfalar DAHİL. Adlar öz kadroyla
       ÇAKIŞMAZ. Ekip içi sıra KANONİKTİR — Cum/Cmt eksik-gün kuralı bu sırayı kullanır):
       ▸ Demir-Beton İnş. Ltd. · Vadi Konakları · 10 kişi
           kalıp ekibi (5): Hüseyin Palabıyık [KALFA] (Kalıpçı) · Mehmet Sarıkuş (Kalıpçı) ·
             Süleyman Akbulut (Kalıpçı) · Hamza Dinçer (Kalıpçı) · Ünal Yavuzer (Düz İşçi)
           demir ekibi (5): Bekir Sarıoğlu [KALFA] (Demir Ustası) · Yakup Tosun (Demir Ustası) ·
             Enver Kılıçarslan (Demir Ustası) · Ayhan Böke (Demir Ustası) · Cevdet Şahinkaya (Düz İşçi)
       ▸ ElektroMek Taahhüt · Vadi Konakları · 6 kişi
           Mustafa Doğanay [KALFA] (Elektrik Ustası) · Serkan Ünlüer (Elektrik Ustası) ·
           Barış Yetkin (Elektrik Ustası) · Tuncay Özdemirci (Elektrik Ustası) ·
           Ferhat Sarpkaya (Kaynakçı) · Uğur Beyazıt (Düz İşçi)
       ▸ Yalıtım Kardeşler · Liman Lojistik Merkezi · 8 kişi
           mantolama ekibi (4): Salih Bingöl [KALFA] (Yalıtım Ustası) · Sinan Tuncel (Yalıtım Ustası) ·
             Erkan Doğruel (Yalıtım Ustası) · Kâmil Bozkır (Yalıtım Ustası)
           izolasyon ekibi (4): Ercan Kavaklı [KALFA] (Yalıtım Ustası) · Levent Akçay (Yalıtım Ustası) ·
             Gökhan Efeoğlu (Yalıtım Ustası) · Okan Sarıgül (Düz İşçi)
     · TAŞERON GÜNLÜK SAYIM KORDONU (madde 6 — kişi bazına geçişte BU vektörler DEĞİŞMEZ;
       kişi satırlarının gün işaretleri toplandığında bu sayıları vermek ZORUNDA):
         Demir-Beton      Pzt 9 · Sal 10 · Çar 8 · Per 10 · Cum 9 · Cmt 8  → haftalık 54 adam-gün
         ElektroMek       Pzt 6 · Sal 5  · Çar 6 · Per 6  · Cum 6 · Cmt 5  → haftalık 34 adam-gün
         Yalıtım Kardeş.  Pzt 7 · Sal 8  · Çar 7 · Per 8  · Cum 7 · Cmt 7  → haftalık 44 adam-gün
       Arşiv haftası (22–28 Haz) firma toplamları: 58 · 34 · 44 (ekip×6 gün tavanının altında).
       2 Tem (bugün) değerleri yemekhane taşeron öğle sayılarıyla BİREBİR: 10 · 6 · 8.
       İŞLENEN 4 GÜNÜN eksik-gün ataması (deterministik — Wave 2 bunu birebir uygular;
       kalfa-kordon düzeltmesiyle 24 kişilik nihai listeye göre yeniden doğrulandı):
         Demir-Beton  Pzt −1 Ayhan Böke (yok) · Çar −2 Cevdet Şahinkaya (izin) + Ünal Yavuzer (yok)
         ElektroMek   Sal −1 Uğur Beyazıt (yok)
         Yalıtım K.   Pzt −1 Okan Sarıgül (yok) · Çar −1 Gökhan Efeoğlu (izin)
       Cum/Cmt eksikleri (çıktı sayfası — ekranda işlenmemiş, yalnız haftalık çıktıda görünür):
       ekip listesinin SONUNDAN sırayla düşürülür; nihai sıraya göre hesaplanmış hâli:
         Demir-Beton  Cum −1 Cevdet Şahinkaya · Cmt −2 Cevdet Şahinkaya + Ayhan Böke
         ElektroMek   Cum  0 · Cmt −1 Uğur Beyazıt
         Yalıtım K.   Cum −1 Okan Sarıgül · Cmt −1 Okan Sarıgül   (Liman çıktısında)
       Uydurma ad EKLENMEZ; kalfalar eksik-gün atamasına GİRMEZ (ekip başı sahada sabittir).
     · POZİSYON KANONİĞİ — fPozisyon 15 → 16 (kalfa-kordon turu düzeltmesi; taşeron kadrosunda
       kullanılan pozisyonlar kanonik listeye HİZALANDI, liste dışı unvan ÜRETİLMEZ):
         "Demirci"                      → mevcut "Demir Ustası"a map edilir (yeni seçenek AÇILMAZ)
         "Yalıtımcı" + "İzolasyon Ustası" → tek YENİ seçenek: "Yalıtım Ustası"  (15 → 16)
         "Sıvacı"                       → mevcut "Düz İşçi"ye map edilir (pasif kayıt 025)
       "Yalıtım Ustası" HTML seçeneği Wave 1 / Track B'de crm-personel-form.html içine işlenir —
       bu turda YALNIZ kanonik kural olarak kayıtlıdır, fPozisyon markup'ına DOKUNULMAZ.
       Ofis/yönetim 6 pozisyonu (Şantiye Şefi · Muhasebe · Satın Alma · İnsan Kaynakları ·
       Teknik Müdür · Genel Müdür) DEĞİŞMEZ.
     · FİRMA/TAŞERON ALAN KURALI (madde 5 / S6 — personel formu Görev & Departman sekmesi):
       Firma/Taşeron + Kalfa bloğu YALNIZ şu 10 saha pozisyonunda açılır: Saha Personeli ·
       Formen · Kalıpçı · Demir Ustası · Elektrik Ustası · Operatör · Kaynakçı · Marangoz ·
       Düz İşçi · Yalıtım Ustası (10. sırada YENİ — pozisyon kanoniği maddesi).
       Kalan 6 pozisyonda (Şantiye Şefi · Muhasebe · Satın Alma · İnsan Kaynakları ·
       Teknik Müdür · Genel Müdür) blok GİZLİ ve firma otomatik "Yapıtaş İnşaat A.Ş.".
       Öz kadro için firma değeri "Yapıtaş İnşaat A.Ş." — puantaj çıktısındaki mevcut
       "Çalıştığı Firma / Taşeron" kolonu (35 satırda Yapıtaş) bu değerle zaten hizalı.
     · PASİF PERSONEL KAYITLARI (madde 8 / S10 — 3 kayıt, mevcut 22 aktife EK; kanonik
       headcount 69/93 ve 35-22-12 kırılımı DEĞİŞMEZ, ayrılanlar zaten kadro dışıdır):
         023 Kudret Beşikçi · Düz İşçi   · Vadi Konakları          · ayrılış 12 Haz 2026 · istifa
         024 Hikmet Uğurlu  · Operatör   · Liman Lojistik Merkezi  · ayrılış 28 Şub 2026 · iş akdi feshi
         025 Nadir Çamlıca  · Düz İşçi   · Merkez Şantiye          · ayrılış 30 Nis 2026 · emeklilik
       ?per= MAP 001-022 → 001-025'e genişler (023-025 pasif; DEFAULT 004 DEĞİŞMEZ).
       Durum rozeti: aktif .gstat.ok "Aktif" · pasif .gstat.off "Ayrıldı" (yeni rozet İCAT EDİLMEZ).
       Chip sayaçları: hepsi 25 · aktif 22 · pasif 3; kategori chip'leri (yonetim 3 · sef 3 ·
       ofis 3 · saha 13) AKTİF sayılarını KORUR. İki eksenli filtre sayfa-lokal AND deseniyle
       kurulur (kasa .filter-bar.stack + pluxee curTur/curSantiye emsali) — ui.js primitifine DOKUNULMAZ.
     · ZORUNLU EVRAK SETİ (madde 9 / S11 — 12 kanonik kategorinin seti ve SIRASI DEĞİŞMEZ;
       yalnız ilk 3'ü zorunlu bayrağı alır. Bayrak Wave 1'de EVRAK_KATEGORI kayıtlarına
       zorunlu:true olarak işlenir — personel-form, personel-ozluk, personel-detay ÜÇÜNDE birden):
         01 Kimlik fotokopisi         → ZORUNLU
         02 İş sözleşmesi             → ZORUNLU
         03 SGK işe giriş bildirgesi  → ZORUNLU
         04-12 (İkametgâh · Adli sicil · Sağlık raporu · İSG sertifikası · Mesleki yeterlilik ·
         Ehliyet/SRC · Diploma · Acil durum formu · KVKK) → opsiyonel
       Zorunlusu eksik personel özlük matrisinde AYRI uyarı rozeti alır (mevcut .gstat dilinden).
     · İL/İLÇE (madde 4 / S1-S3): kanonik il/ilçe listesi ÜRETİLMEZ. Adres alanı
       crm-santiye-form.html:104-105 desenini birebir devralır — fIl + fIlce SERBEST METİN
       (81 il select'i YOK). crm-personel.html liste chip'leri kanonik veride fiilen geçen
       illerden türetilir (İstanbul · İzmir · Kocaeli · Sakarya). Filtre yeri: personel listesi.
     · KASA FORMATI YAYILIMI (madde 1-2 / S12): pluxee + kredikarti hareket listeleri
       crm-operasyon-kasa.html #tblDefter kolon düzenini devralır (Tarih · Açıklama · Tutar +
       yürüyen bakiye), df-devir/df-total/df-mevcut satır dili ve .df-mobile-list (≤640px)
       mobil kart DOM'u dahil. Pluxee'de yürüyen bakiye KART BAZLIDIR (kart karosu seçilince
       defter o karta filtrelenir — kasa .ks-card→defter idiyomunun birebir karşılığı).
       Kredi kartında banka seçimi hâlihazırda var (kredikarti-form #fKart) — korunur;
       sef rol budaması (yalnız Garanti BBVA) kolon düzeni değişse de AYNEN yaşar.
       Değişmeyen KPI kordonu: pluxee ₺11.240 / ₺15.000 / ₺3.760 · KK limit ₺525.000,
       dönem borcu ₺234.650, kullanılabilir ₺290.350.
     · AVANS PERSONEL SEÇİCİSİ (madde 7 / S9): aranabilir seçici SAYFA-LOKAL yazılır,
       ortak ui.js'e YENİ primitif eklenmez (.fb-search görsel dili + pluxee applyFilter
       deseni). Seçenek listesi 7'den 22 kanonik AKTİF personele tamamlanır (pasif 3 kayıt
       avans seçicisinde LİSTELENMEZ). data-admin-only guard'ı korunur.
   ─ DALGA 20 KANONİK TANIMLAR (2026-07-30 — v2 revizyon turu; kaynak: tasks/v2-dokuman.txt
       §4.1/§7.2/§8.2/§9.4/§10.1/§10.2/§11.1/§11.2 + tasks/kararlar.md K-22/K-23. Bu blok
       yalnız SUNUM KATMANI sabitlerini belgeler — 93/69+24/54-34-44 kordonuna DOKUNMAZ,
       alt track'lerin sayfa üretimi (T-SANTIYE/T-GOREV/T-OPERASYON vb.) BURADAN okur):
     · 4 KAPALI ŞANTİYE (§4.1 H1 — tam alan seti; hepsi 0 personel, şef Atanmadı, hiçbir
       kasa/puantaj/yemekhane/hakediş/headcount toplamına GİRMEZ, Vadi 51/Liman 30/Merkez 12/
       TOPLAM 93 AYNEN kalır — üstteki kanonik Şantiyeler listesindeki brief'in açılımı):
         Çınar Sokak Karma Proje (kod CSKP) · karma · Ümraniye/İstanbul · durum Pasif ·
           başlangıç 10 Oca 2023 · kapanış — · neden "Yatırımcı ile yeniden değerlendirme
           sürecinde — saha faaliyeti Mart 2026'dan beri durduruldu" · son durum "Faaliyet
           durduruldu, ekip diğer şantiyelere kaydırıldı" · son işlem 3 Mar 2026
         Bahçelievler Toplu Konut (kod BTK) · konut · Bahçelievler/İstanbul · durum Askıya
           Alınan · başlangıç 5 Haz 2024 · kapanış — · neden "Belediye imar planı revizyonu
           nedeniyle inşaat ruhsatı yeniden değerlendiriliyor" · son durum "Ruhsat sürecinde,
           saha kapalı" · son işlem 18 May 2026
         Fatih Mahallesi Restorasyon (kod FMR) · restorasyon · Fatih/İstanbul · durum
           Arşivlenen · başlangıç 2 Mar 2018 · kapanış/teslim 14 Kas 2019 · neden "Proje
           2019'da tamamlandı; 5 yıllık garanti süreci sona erdiği için arşive kaldırıldı" ·
           son durum "Tamamlandı, arşivde" · son işlem 14 Kas 2024
         Kartal Sahil Rezidans (kod KSR) · konut · Kartal/İstanbul · durum İptal Edilen ·
           başlangıç 20 Eyl 2025 (ruhsat aşaması, saha faaliyeti hiç başlamadı) · kapanış — ·
           neden "Yatırımcı finansman sağlayamadığı için proje ruhsat aşamasında iptal
           edildi" · son durum "İptal edildi, saha faaliyeti hiç başlamadı" · son işlem
           12 Ara 2025
       Şantiye listesi 8 filtre chip'i (§4.1, H1 — hiçbiri ölü kalmaz): Tümü · Aktif ·
       Planlama · Tamamlanan · Pasif · Askıya Alınan · Arşivlenen · İptal Edilen — üstte
       "Pasif Şantiyeleri Göster" switch (varsayılan KAPALI); switch açılmadan yalnız
       Aktif/Planlama/Tamamlanan görünür (5 kanonik şantiye), açılınca 4 kapalı şantiye eklenir.
     · 11 DEPARTMAN HAVUZU (§11.1 + K-22 — görev formu "Havuza Bırak" seçeneği; 7'sinin
       ROLES karşılığı VAR ve gerçek görünürlük filtresi uygular, 4'ü Faz 2'ye ERTELENDİ):
         Muhasebe Departmanı  → ROLES.muhasebe   (gerçek filtre)
         İK Departmanı        → ROLES.ik         (gerçek filtre)
         Satın Alma Departmanı→ ROLES.satinalma  (gerçek filtre)
         Teknik Ofis          → ROLES.teknik     (gerçek filtre)
         Şantiye Ekibi        → ROLES.sef        (gerçek filtre — kendi şantiyesi)
         Yönetim              → ROLES.yonetim (+ superadmin/sahip, tüm havuzları zaten görür)
         Satış Ekibi          → ROLES.satistemsilci + ROLES.satismudur (gerçek filtre)
         İSG Ekibi            → ROLES karşılığı YOK — Faz 1'de yonetim/teknik/sef görür (Faz 2'de rol)
         Depo/Lojistik        → ROLES karşılığı YOK — Faz 1'de yonetim/teknik/sef görür (Faz 2'de rol)
         Saha Ekibi (genel)   → ROLES karşılığı YOK — Faz 1'de yonetim/teknik/sef görür (Faz 2'de rol)
         Taşeron Havuzu       → ROLES karşılığı YOK — Faz 1'de yonetim/teknik/sef görür (Faz 2'de rol)
       Kural (§11.2): departman havuzundaki görevi yalnız o departmanın kullanıcısı görür;
       şantiye bağlantısı varsa yalnız o şantiyeye yetkili departman kullanıcısı görür;
       yönetim rolleri (superadmin/sahip/yonetim) TÜM havuzları görür. Üzerine alma → sorumlu
       olur, havuzdan çıkar, audit log'a yazılır (crm-ayarlar-log.html LOG- serisi), yeniden
       havuza bırakılabilir. shell.js'e YENİ rol EKLENMEDİ (K-21 emsali — kanıt yokken rol
       matrisi genişletilmez); 4 ROLES-karşılıksız havuzun gerçek rol ayrımı Faz 2 kapsamı.
     · 14 SAHA BİLDİRİM TÜRÜ (§9.4 — crm-santiye-bildirim-form.html tür seçimine EKLENİR;
       mevcut SBL-2026-### kayıtlarındaki türlerle (Yapı İlerlemesi, Elektrik/Mekanik, İSG,
       Atölye/Depo, Malzeme Teslimatı, Kalite Kontrol) ÇAKIŞMAZ, form seçim listesini genişletir):
       Beton Dökümü · Malzeme Teslimatı · İSG Uygunsuzluğu · Kalite Kontrol · Makine Arızası ·
       Taşeron Sahada · İş Tamamlandı · Revize Gerekiyor · Acil Durum · Hava Koşulu Etkisi ·
       Denetim Notu · Hakediş Kanıt Fotoğrafı · Öncesi/Sonrası Kayıt · Şantiye İlerleme Kaydı
     · 14 DOSYA KATEGORİSİ (§8.2 — crm-santiye-detay.html Dosyalar sekmesi "Dosya/Sözleşme/
       Ek Protokol/Ruhsat/…/Teslim Tutanağı Ekle" butonlarının kategori seçimi):
       Sözleşme · Ek Protokol · Ruhsat · Yapı Kullanım Belgesi · Teknik Çizim ·
       DWG / Proje Dosyası · Hakediş Eki · İSG Belgesi · Fatura · Dekont · Fotoğraf ·
       Video · Teslim Tutanağı · Diğer
     · 8 TAŞERON PUANTAJ ONAY DURUMU (§7.2 — crm-operasyon-taseron-puantaj.html satır rozeti
       + crm-finans-taseron-detay.html Taşeron Puantajı sekmesindeki gvChain AYNI seti okur,
       H6 — çatallanmaz; 6 sabit .gstat sınıfına map edilir, yeni rozet İCAT EDİLMEZ):
         Taslak (.gstat.off) · Onaya Gönderildi (.gstat.wait) · Şantiye Şefi Onayında (.gstat.info) ·
         Teknik Ofis Onayında (.gstat.info) · Onaylandı (.gstat.ok) · Revize İstendi (.gstat.warn) ·
         Reddedildi (.gstat.danger) · Hakedişe Aktarıldı (.gstat.ok, koyu türev — TH- belgesine bağlı)
     · 14 ÖRNEK TAKVİM KATMANI + RENK PALETİ (§10.1/§10.2 — v2/crm-santiye-ajanda-katman.html
       kanonik başlangıç seti, ortak localStorage['gv_katmanlar'] — H4). DİKKAT: bu katmanlar
       DALGA 4A'daki kişisel ajanda "olay türü" setinden (toplanti/gorev/ziyaret/izin/odeme/
       termin — o set AYNEN kalır) AYRI bir kavramdır — iş programı/şantiye takvimi katmanı.
       Renkler YALNIZ tokens.css token'larından (renk-mix dahil) türetildi, HAM HEX YOK;
       marka kuralı gereği turuncu/sarı İSG tonu hiçbirine verilmedi (İSG dahil tüm güvenlik/
       kritik katmanlar --danger ailesinden, --warn amber tonu bilinçli KULLANILMADI):
         Beton Dökümü          var(--acc-deep)                                        · varsayılan açık
         Kalıp İşleri          var(--ink-2)                                           · varsayılan açık
         Demir İşleri          var(--muted)                                           · varsayılan açık
         Mekanik               var(--info)                                           · varsayılan açık
         Elektrik              color-mix(in srgb, var(--info) 55%, var(--acc) 45%)    · varsayılan açık
         İSG                   var(--danger)                                         · varsayılan açık
         Denetim               color-mix(in srgb, var(--ink-2) 60%, var(--muted) 40%)· varsayılan kapalı
         Malzeme Teslimatı     var(--ok)                                             · varsayılan açık
         Hakediş               var(--acc-ink)                                        · varsayılan açık
         Toplantı              color-mix(in srgb, var(--info) 70%, var(--ink) 30%)   · varsayılan açık
         Müşteri Ziyareti      color-mix(in srgb, var(--acc) 60%, var(--ink-2) 40%)  · varsayılan kapalı
         Taşeron Mobilizasyonu color-mix(in srgb, var(--muted) 70%, var(--danger) 30%)· varsayılan açık
         Kritik İş             color-mix(in srgb, var(--danger) 70%, var(--ink) 30%) · varsayılan açık
         Resmi İşlem           var(--ink)                                            · varsayılan kapalı
       Katman alanları (§10.1 form): ad, tür, renk, ikon (Font Awesome seçici — CDN kilitli
       set), şantiye bağlantısı, departman bağlantısı (üstteki 11 havuz listesiyle AYNI),
       görünürlük durumu, varsayılan açık/kapalı, yetkili roller (H4 — santiye secs'i olan
       5 rol: superadmin/sahip/yonetim/teknik/sef), açıklama. Katman filtreleri (§10.2 ek
       özellikler): renk seç · ikon seç · gizle/göster · sadece kendi katmanlarım · şantiye
       bazlı filtrele · departman bazlı filtrele · görev türüne göre filtrele.

   ─ V2 SAYIM KANONİĞİ (2026-07-31 · A dokümanı §3 — KİLİTLİ, TEK SEFERLİK GÜNCELLEME)
       Bu blok yalnız `v2/` ağacı içindir; kök sürüm eski zinciriyle donmuştur.
       A dokümanı §3 liste sayaçlarını açıkça yeniden tanımladı. Aşağıdaki sayılar
       bu turun KİLİTLİ değerleridir: dalgalar bunları YALNIZ TÜKETİR, hiçbir dalga
       değiştirmez. Bir sayının değişmesi gerektiği düşünülüyorsa yaklaşım yanlıştır.

     · ŞANTİYE SAYIMI (§3 "Örnek Şantiye Sayımı" — "5 şantiye / Tümü 9" çelişkisinin çözümü):
         Toplam Şantiye   9   ← 5 kanonik + 4 kapalı (DALGA 20 bloğu)
         Aktif Görünüm    5   ← "Pasif Şantiyeleri Göster" switch'i KAPALIYKEN görünen
         Aktif            3   ← Vadi Konakları · Liman Lojistik Merkezi · Merkez Şantiye
         Planlama         1   ← Göl Evleri 2. Etap
         Tamamlanan       1   ← Kule Ofis B Blok
         Pasif / Arşiv    4   ← CSKP Pasif · BTK Askıya Alınan · FMR Arşivlenen · KSR İptal Edilen
       Denklemler (her liste sayfası bu üçünü SAĞLAMAK ZORUNDA):
         3 + 1 + 1 = 5 (aktif görünüm) · 5 + 4 = 9 (toplam) · 9 − 5 = 4 (pasif/arşiv)
       "Tümü" chip'i switch KAPALIYKEN 5, AÇIKKEN 9 gösterir — 9 ile 5 aynı anda
       çelişkili biçimde YAZILMAZ; özet kart "Toplam 9 · görünen 5" dilini kullanır.

     · PERSONEL SAYIMI (§3 "Örnek Personel Sayımı" — "22 personel / Tümü 25" çelişkisinin çözümü):
         Toplam Personel  25  ← 001-025 (?per= MAP aralığı)
         Aktif Personel   22  ← 001-022
         Pasif / Ayrılan   3  ← 023 Kudret Beşikçi · 024 Hikmet Uğurlu · 025 Nadir Çamlıca
         Bugün İzinli      1  ← 2 Tem 2026'da izinli AKTİF personel (22'nin İÇİNDE, ayrı küme DEĞİL)
         Eksik Evrak       4  ← zorunlu 3 evraktan en az biri eksik AKTİF personel (22'nin İÇİNDE)
       Denklemler: 22 + 3 = 25 · izinli 1 ⊂ aktif 22 · eksik evrak 4 ⊂ aktif 22.
       "İzinli" ve "Eksik Evrak" TOPLAMA EKLENMEZ — kesişen alt kümelerdir; özet kartta
       "22 aktif · bunlardan 1 izinli, 4 eksik evraklı" dili kullanılır.

     · SAYIM DİLİ — TÜM LİSTE SAYFALARI İÇİN ORTAK (§3 "Toplam Sayı Mantığı"):
       Her liste sayfasının kayıt sayısı özeti şu 6 ekseni birbirine karıştırmadan verir:
         toplam kayıt · aktif kayıt · pasif kayıt · arşivlenen kayıt · filtre sonucu · seçili kayıt
       Filtre uygulanmışken metin "N kayıttan M tanesi" biçimindedir; M ile N asla
       eşit sayılmaz, ikisi ayrı değişkendir.

     · BOŞ DURUM SIRALAMASI (§3 "Doğru Liste Durum Mantığı" — KRİTİK KURAL):
         loading → error → filteredResults.length === 0 → kayıtlar
       Kayıt varken boş durum mesajı ASLA render edilmez. Boş durum ile tablo gövdesi
       birbirini DIŞLAR (ikisi aynı anda görünür olamaz).

     · DEĞİŞMEYEN KORDON: 93 saha (69 öz + 24 taşeron) · Vadi 51 · Liman 30 · Merkez 12 ·
       Demir-Beton 10 · ElektroMek 6 · Yalıtım Kardeşler 8 · haftalık 54/34/44 · arşiv
       58/34/44 · yemekhane 93 öğün ₺16.020 · kasa ₺165.130 · ZMT-2026-045 Aylin Koç ·
       Yapıtaş İnşaat A.Ş. §3 güncellemesi bu zincire DOKUNMAZ — saha headcount (93) ile
       personel KAYIT sayısı (25) AYRI metriklerdir, birbirine denklenmez.
   ===================================================================== */
(function(){
  'use strict';

  /* ---- i18n'e hazır shell metinleri (tek kaynak) ---- */
  var STR = {
    brand:'[ÜRÜN ADI]',
    greetDate:'2 Temmuz 2026, Perşembe',
    tenant:'Yapıtaş İnşaat A.Ş.',
    tenantPlan:'Profesyonel Paket',
    search:'Ara — şantiye, kişi, talep, hakediş…',
    notif:'Bildirimler',
    switchTenant:'Firma değiştir',
    firmSettings:'Firma Ayarları',
    logout:'Çıkış / Rol Değiştir',
    signature:'Gaviaworks'
  };

  /* ---- BÖLÜM config — rail sırası bu sırayla çizilir ---- */
  var SECTIONS = {
    panel:{ ic:'fa-gauge-high', eyebrow:'Genel Bakış', title:'Ana Panel', menu:[
      {ic:'fa-gauge-high', lbl:'Ana Panel', href:'crm-panel.html', screen:'panel'},
      {seclbl:'Gündem'},
      {ic:'fa-sun',            lbl:'Günlük Özet',      href:'crm-panel-ozet.html',        screen:'ozet'},
      /* [Dalga 6A] menu-revizyonu.md §1 "EKLE" — kiosk ekranı diskte vardı, menüden hiç
         linklenmiyordu (yörüngesiz kalem). scr.panel'e de tüm kısıtlı rollere eklendi. */
      {ic:'fa-tv',             lbl:'Operasyon Ekranı', href:'crm-panel-operasyon.html',   screen:'operasyon-kiosk'},
      {ic:'fa-calendar-week',  lbl:'Ajanda',           href:'crm-panel-ajanda.html',      screen:'ajanda'},
      {ic:'fa-list-check',     lbl:'Görevlerim',       href:'crm-gorev.html?f=bana'},
      {ic:'fa-stamp',          lbl:'Bekleyen Onaylar', href:'crm-panel-onaylar.html',     screen:'onaylar', cnt:'12'},
      {ic:'fa-bell',           lbl:'Bildirimler',      href:'crm-panel-bildirimler.html', screen:'bildirimler'},
      {ic:'fa-bullhorn',       lbl:'Duyurular',        href:'crm-panel-duyurular.html',   screen:'duyurular'},
      {seclbl:'Analiz'},
      /* [D13] yönetici paneli — scr ile yalnız superadmin+sahip+yonetim (2.15) */
      {ic:'fa-table-cells-large', lbl:'Yönetici Paneli', href:'crm-panel-yonetici.html',  screen:'yonetici'}
      /* [v3-Dalga2] "Raporlar" kalemi buradan ÇIKTI — spec-menu-mimarisi.md §1/§4.1:
         Raporlar artık kendi rail bölümü (bkz. aşağıda SECTIONS.raporlar). Hedef dosya
         (crm-panel-raporlar.html) DEĞİŞMEDİ, yalnız data-sec="raporlar" oldu. */
    ]},
    santiye:{ ic:'fa-helmet-safety', eyebrow:'Saha', title:'Şantiye Yönetimi', menu:[
      /* [Dalga 2 / M-1] Proje katmanı — hiyerarşi Firma → Proje → Şantiye/Etap olduğu için
         kalem Şantiye Listesi'nin ÜSTÜNDE. Yeni BÖLÜM açılmadı (K-2: "menü yapısını
         gereksiz büyütme"), mevcut Saha bölümüne tek kalem eklendi. */
      {ic:'fa-diagram-project', lbl:'Projeler',          href:'crm-santiye-proje.html', screen:'proje'},
      {ic:'fa-helmet-safety',  lbl:'Şantiye Listesi',    href:'crm-santiye.html', screen:'liste'},
      {ic:'fa-camera',         lbl:'Saha Bildirimleri',  href:'crm-santiye-bildirimler.html', screen:'bildirimler', cnt:'4'},
      {ic:'fa-calendar-days',  lbl:'İş Programı',        href:'crm-santiye-ajanda.html', screen:'ajanda'},
      {ic:'fa-shield-halved',  lbl:'İSG Tutanakları',    href:'crm-santiye-isg.html',    screen:'isg'}
    ]},
    gorev:{ ic:'fa-list-check', eyebrow:'İş Takibi', title:'Görev ve İş Takibi', menu:[
      /* tek liste + görünüm: sayfa ?f= paramını shell.js'ten ÖNCE body[data-screen]'e yazar */
      /* [T-GOREV-01] cnt:'8' yalnız BEYAN edilen varsayılan (dizin/kod-okuma amaçlı) —
         gerçek değer rol çözüldükten SONRA gorevPoolVisibleCount()−claim formülüyle
         HER ZAMAN ezilir (bkz aşağıda rol bloğu), sabit sayı asla ekrana YANSIMAZ. */
      {ic:'fa-layer-group',    lbl:'Havuz',            href:'crm-gorev.html?f=havuz',    screen:'havuz', cnt:'8'},
      {ic:'fa-inbox',          lbl:'Bana Verilenler',  href:'crm-gorev.html?f=bana',     screen:'bana', cnt:'7'},
      {ic:'fa-paper-plane',    lbl:'Verdiklerim',      href:'crm-gorev.html?f=verdigim', screen:'verdigim'},
      {ic:'fa-triangle-exclamation', lbl:'Gecikenler', href:'crm-gorev.html?f=geciken',  screen:'geciken', cnt:'3'},
      {ic:'fa-circle-check',   lbl:'Tamamlananlar',    href:'crm-gorev.html?f=tamam',    screen:'tamam'}
    ]},
    /* [v3-Dalga2] spec-menu-mimarisi.md §4.4 — Puantaj/Taşeron Puantajı/Yemekhane
       operasyon'dan taşındı (dosya adları DEĞİŞMEDİ, K-162). Sıra + "Sağlık Raporları"
       adlandırması §4.4'ün birebir listesi (yeni rail-seviyesi "Raporlar" bölümüyle
       isim çakışmasını önlemek için 'Raporlar' → 'Sağlık Raporları', screen='rapor'
       AYNI kaldı — bkz tasks/kararlar.md). */
    personel:{ ic:'fa-users', eyebrow:'İnsan Kaynağı', title:'Personel Yönetimi', menu:[
      {ic:'fa-users',          lbl:'Personel Listesi', href:'crm-personel.html',       screen:'liste'},
      {ic:'fa-folder-open',    lbl:'Özlük & Evrak',    href:'crm-personel-ozluk.html', screen:'ozluk'},
      {ic:'fa-umbrella-beach', lbl:'İzinler',          href:'crm-personel-izin.html',  screen:'izin', cnt:'5'},
      {ic:'fa-file-medical',   lbl:'Sağlık Raporları', href:'crm-personel-rapor.html', screen:'rapor'},
      {ic:'fa-hand-holding-dollar', lbl:'Avanslar',    href:'crm-personel-avans.html', screen:'avans'},
      {ic:'fa-user-clock',     lbl:'Puantaj',          href:'crm-operasyon-puantaj.html', screen:'puantaj'},
      {ic:'fa-people-arrows',  lbl:'Taşeron Puantajı', href:'crm-operasyon-taseron-puantaj.html', screen:'taseron-puantaj'},
      {ic:'fa-utensils',       lbl:'Yemekhane',        href:'crm-operasyon-yemekhane.html', screen:'yemekhane'}
    ]},
    /* [v3-Dalga2] "operasyon" bölümü DAĞITILDI (spec-menu-mimarisi.md §1/§2, K-162)
       — kasa/kredikarti/pluxee → finans, puantaj/taşeron-puantaj/yemekhane → personel,
       arac/demirbas/makine ailesi → aşağıdaki YENİ "varlik" bölümü. Dosya adları DEĞİŞMEDİ,
       yalnız <body data-sec> değerleri güncellendi. Eski yorum bloklarının (Dalga 4/
       Dalga 20) muhtevası aşağıya, ilgili kalemlerin yanına taşındı. */
    /* [Bölüm 2.7 · R-27/R-28 — Yasin Bey, video 08:57/10:19] Varlık menüsü ÜÇ ana kayda
       indirildi. Önceki turlarda burada 6 satır vardı; patron bunların üçünün ANA KAYDIN
       İÇİNDE yaşamasını istedi, ayrı menü kalemi olarak değil:
         · Demirbaş Etiketleri (R-27/R-30) → Demirbaşlar sayfasındaki "Etiketleri Yönet"
           butonundan girilir. Patron: "demirbaş etiketleri dediğimiz yapı demirbaşın
           içerisinde olması lazım" + "etiket yönet dediğimiz yapı olduğundan dolayı
           buradaki sayfalandırmayı oraya yönlendirebiliyoruz".
         · Araç Evrakları (R-28) → araç detayında ZATEN sekme (`lnkEvrakTam` CTA'sı ile
           tam yönetim ekranına açılır). Patron: "araç evrakları araçların içerisinde
           bir sekmede".
         · Bakım / Muayene Takibi (R-28) → araç detayında ZATEN sekme (`lnkBakimTam`).
           Patron: "bakım muayene kısmı da aynı şekilde onun içerisinde bir sekmede".
       ÜÇ SAYFA DA SİLİNMEDİ — menüsüz alt-akış oldular; barındırdıkları tam yönetim
       ekranları (etiket listesi, versiyonlu evrak yükleme, kronolojik bakım kaydı)
       yerinde duruyor ve ana kayıttan link alıyor. Bu, v3-Dalga2'de bunları üst-seviye
       menü kalemi yapan kararın patron talimatıyla GERİ ALINMASIDIR.
       NOT: `arac-detay`/`demirbas-detay` kendi benzersiz data-screen'ini taşımaz, ana
       ekranı (`arac`/`demirbas`) miraslar — bu yüzden menü budaması rol erişimini
       daraltmıyor, evrak/bakım sekmelerine giden yol her rolde açık kalıyor. */
    varlik:{ ic:'fa-cubes', eyebrow:'Varlık', title:'Varlık ve Araç Yönetimi', menu:[
      {ic:'fa-toolbox',        lbl:'Demirbaşlar',         href:'crm-operasyon-demirbas.html',  screen:'demirbas'},
      {ic:'fa-car-side',       lbl:'Araçlar',             href:'crm-operasyon-arac.html',      screen:'arac'},
      {ic:'fa-truck-pickup',   lbl:'Makine Puantajı',     href:'crm-operasyon-makine.html',    screen:'makine'}
    ]},
    /* [D12] sipariş zinciri + stok & depo + tedarikçi — 8 dosya diskte, unlock dalga sonunda */
    satinalma:{ ic:'fa-cart-flatbed', eyebrow:'Tedarik', title:'Satın Alma Yönetimi', menu:[
      {ic:'fa-boxes-stacked',  lbl:'Malzeme Talepleri',   href:'crm-satinalma-talepler.html', screen:'talepler', cnt:'9'},
      {ic:'fa-file-invoice',   lbl:'Satın Alma Formları', href:'crm-satinalma-formlar.html',  screen:'formlar'},
      {ic:'fa-cart-shopping',  lbl:'Siparişler',          href:'crm-satinalma-siparisler.html', screen:'siparisler', cnt:'5'},
      {ic:'fa-truck-ramp-box', lbl:'Termin Takibi',       href:'crm-satinalma-termin.html',   screen:'termin'},
      {ic:'fa-receipt',        lbl:'İrsaliye & Fatura',   href:'crm-satinalma-irsaliye-fatura.html', screen:'irsaliye', cnt:'1'},
      {seclbl:'Depo & Tedarik', tag:'Faz 2'},
      {ic:'fa-warehouse',      lbl:'Stok & Depo',         href:'crm-satinalma-stok.html',     screen:'stok', cnt:'3'},
      {ic:'fa-industry',       lbl:'Tedarikçiler',        href:'crm-satinalma-tedarikciler.html', screen:'tedarikciler'}
    ]},
    cari:{ ic:'fa-address-book', eyebrow:'Rehber & Hesap', title:'Cari ve Firma Yönetimi', menu:[
      {ic:'fa-building',       lbl:'Firma Rehberi',   href:'crm-cari.html',       screen:'rehber'},
      {ic:'fa-id-card',        lbl:'Kişiler',         href:'crm-cari-kisiler.html', screen:'kisiler'},
      {ic:'fa-scale-balanced', lbl:'Cari Durum',      href:'crm-cari-durum.html', screen:'durum'},
      /* [Dalga 6A / K-17] doküman §25-7 Taşeronlar+Tedarikçileri Cari altına koyuyor;
         dosyalar TAŞINMAZ (K-06), yalnız çapraz-link menü kalemi. reqSec/reqScreen ile
         BUDANIR — yalnız hedef bölüme gerçekten erişimi olan rolde render edilir, aksi
         halde ölü kalem doğardı (satinalma/satismudur rolünde finans/satinalma yok) */
      {ic:'fa-people-arrows', lbl:'Taşeronlar',    href:'crm-finans-taseronlar.html',    reqSec:'finans',    reqScreen:'taseronlar'},
      {ic:'fa-industry',      lbl:'Tedarikçiler',  href:'crm-satinalma-tedarikciler.html', reqSec:'satinalma', reqScreen:'tedarikciler'}
    ]},
    /* [v3-Dalga2] YENİ bölüm — spec-menu-mimarisi.md §1/§4.9 (K-166). panel'in eski
       "Raporlar" kalemi (crm-panel-raporlar.html) artık kendi bölümü; 15 rapor dosyası
       (crm-panel-rapor-*.html) data-sec="raporlar" oldu ama data-screen="raporlar"
       KİMLİĞİNİ KORUR (16 dosya aynı screen'i paylaşır — K-166). Rapor Merkezi dışındaki
       15 kalem BİLİNÇLİ screen'siz bırakıldı (budamadan muaf çapraz link, spec §3 gerekçesi:
       16 benzersiz screen dağıtmak 11 rolün scr matrisini yeniden yazmayı gerektirirdi).
       Etiket/ikon çifti crm-panel-raporlar.html'in KENDİ kart etiketlerinden birebir alındı
       (kanonik kaynak orası); doküman §10.2-9'un adlandırdığı 4 kalem (Şantiye/Personel/
       Puantaj/Hakediş Raporları) doküman adını taşır. */
    raporlar:{ ic:'fa-chart-column', eyebrow:'Analiz', title:'Raporlar', menu:[
      {ic:'fa-chart-column',        lbl:'Rapor Merkezi',            href:'crm-panel-raporlar.html',      screen:'raporlar'},
      {ic:'fa-users',               lbl:'Personel Raporları',       href:'crm-panel-rapor-personel.html'},
      {ic:'fa-helmet-safety',       lbl:'Şantiye Raporları',        href:'crm-panel-rapor-santiye.html'},
      {ic:'fa-user-clock',          lbl:'Puantaj Raporları',        href:'crm-panel-rapor-puantaj.html'},
      {ic:'fa-umbrella-beach',      lbl:'İzin Raporu',              href:'crm-panel-rapor-izin.html'},
      {ic:'fa-hand-holding-dollar', lbl:'Avans Raporu',             href:'crm-panel-rapor-avans.html'},
      {ic:'fa-toolbox',             lbl:'Demirbaş Raporu',          href:'crm-panel-rapor-demirbas.html'},
      {ic:'fa-truck-pickup',        lbl:'Makine Raporu',            href:'crm-panel-rapor-makine.html'},
      {ic:'fa-file-signature',      lbl:'Hakediş Raporları',        href:'crm-panel-rapor-hakedis.html'},
      {ic:'fa-address-book',        lbl:'Cari Raporu',              href:'crm-panel-rapor-cari.html'},
      {ic:'fa-boxes-stacked',       lbl:'Talep Raporu',             href:'crm-panel-rapor-talep.html'},
      {ic:'fa-coins',               lbl:'Şantiye Maliyet Raporu',   href:'crm-panel-rapor-maliyet.html'},
      {ic:'fa-business-time',       lbl:'Personel Çalışma Raporu',  href:'crm-panel-rapor-calisma.html'},
      {ic:'fa-arrow-trend-up',      lbl:'Fazla Mesai (FM) Raporu',  href:'crm-panel-rapor-fm.html'},
      {ic:'fa-arrow-trend-down',    lbl:'Eksik Mesai (EM) Raporu',  href:'crm-panel-rapor-em.html'},
      {ic:'fa-chart-gantt',         lbl:'İş Programı Raporu',       href:'crm-panel-rapor-isprogrami.html'}
    ]},
    /* [D12] bütçe + maliyet + nakit + taşeron kartları — 6 dosya diskte, unlock dalga sonunda.
       Taşeron Kartları = KİMLİK/performans; Taşeron Hakedişleri İŞLEM listesi olarak kalır (K9) */
    /* [v3-Dalga2] spec-menu-mimarisi.md §4.5 — Kasa/Kredi Kartı/Pluxee operasyon'dan
       taşındı (K-162, dosya adları DEĞİŞMEDİ), Cari Hareketler çapraz-link olarak eklendi.
       [v3-Dalga3/TB] Banka Hesapları/Hareketleri VE Mizan kalemleri BURADA EKLENDİ
       (bkz aşağı) — Dalga 2'de dosyalar henüz yoktu; TB 7 banka dosyasını üretip
       menüye bağladı, Mizan'ı da (crm-finans-mizan.html TZ'nin ürünü, shell.js TEK
       SAHİP kuralı gereği TZ ekleyemiyordu — LEAD talimatıyla TB ekledi) bağladı. */
    finans:{ ic:'fa-file-signature', eyebrow:'Finans', title:'Finans Yönetimi', menu:[
      {ic:'fa-cash-register',      lbl:'Kasa',              href:'crm-operasyon-kasa.html',       screen:'kasa'},
      /* [v3-Dalga2] yörüngesiz-ekran taramasında bulundu: crm-operasyon-kasa-belgesiz-
         harcama-form.html (data-screen="kasa" — kasa-detay/arac-detay emsaliyle temel
         ekranı miraslıyor) hiçbir sayfadan (kasa.html/kasa-form.html içeriğinde "belgesiz
         harcama" YALNIZ kasa-form.html'in kendi inline toggle'ı, bu ayrı tam-sayfa
         varyantına link YOK) gerçek href ile erişilemiyordu — TM bu iki dosyanın İÇERİĞİNE
         dokunma yetkisine sahip değil (domain separation, yalnız shell.js+data-sec+dizin),
         bu yüzden erişim shell.js menüsünden sağlandı. */
      {ic:'fa-receipt',            lbl:'Belgesiz Harcama Formu', href:'crm-operasyon-kasa-belgesiz-harcama-form.html', screen:'kasa'},
      /* [v3-Dalga3/TB] Banka Hesapları/Hareketleri — spec-menu-mimarisi.md §4 madde 5
         sırasına birebir (Kasa'dan sonra, Kredi Kartları'ndan önce). Alt akış dosyaları
         (form/detay/cikti) menüsüz — data-screen ana ekrandan miras alınır (kararlar.md 149
         emsali). Rol kararı: yalnız scr.finans kısıtı OLMAYAN roller görür (superadmin/
         sahip/yonetim/muhasebe) — teknik/sef/ik'nin scr.finans listesine EKLENMEDİ, KASITLI. */
      {ic:'fa-building-columns',   lbl:'Banka Hesapları',   href:'crm-finans-banka.html',         screen:'banka'},
      {ic:'fa-money-bill-transfer', lbl:'Banka Hareketleri', href:'crm-finans-banka-hareket.html', screen:'banka-hareket'},
      {ic:'fa-money-check-dollar', lbl:'Kredi Kartları',    href:'crm-operasyon-kredikarti.html', screen:'kredikarti'},
      {ic:'fa-credit-card',        lbl:'Pluxee Kartlar',    href:'crm-operasyon-pluxee.html',     screen:'pluxee'},
      /* [v2-Dalga2/LEAD] A dokümanı §6 "Menü Konumu" Finans sırasını AÇIKÇA sayıyor:
         Kasa · Banka Hesapları · Banka Hareketleri · Kredi Kartları · Pluxee Kartlar ·
         AVANSLAR · Cari Hareketler · Hakedişler · Sözleşmeler · MİZAN.
         Avanslar finans menüsünde YOKTU (yalnız personel altındaydı) → §6 sırasındaki
         yerine eklendi. Personel menüsünden KALDIRILMADI: İK akışı orada başlıyor,
         kaldırmak çalışan bir yolu koparırdı. Aynı dosyaya iki menü yolundan erişim
         zaten kabul görmüş desen (cari↔tedarikçiler, finans↔taşeronlar emsali).
         Rol kapısı reqSec ile personel bölümüne devredildi — ROLES matrisine DOKUNULMADI. */
      {ic:'fa-hand-holding-dollar', lbl:'Avanslar',         href:'crm-personel-avans.html', reqSec:'personel', reqScreen:'avans'},
      {ic:'fa-right-left',         lbl:'Cari Hareketler',   href:'crm-cari-durum.html', reqSec:'cari', reqScreen:'durum'},
      {seclbl:'Hakedişler'},
      {ic:'fa-building-columns',lbl:'Kurum Hakedişleri',   href:'crm-finans-kurum.html',       screen:'kurum'},
      {ic:'fa-people-arrows',  lbl:'Taşeron Hakedişleri',  href:'crm-finans-taseron.html',     screen:'taseron', cnt:'2'},
      {ic:'fa-id-card-clip',   lbl:'Taşeron Kartları',     href:'crm-finans-taseronlar.html',  screen:'taseronlar'},
      {seclbl:'Sözleşmeler'},
      {ic:'fa-file-contract',  lbl:'Sözleşme Arşivi',      href:'crm-finans-sozlesmeler.html', screen:'sozlesmeler'},
      /* [v3-Dalga3/TB, LEAD talimatıyla] Mizan — §16 madde 2 + §4.2/§10.2-5 sırası
         (Sözleşmeler'den sonra, Faz 2 Bütçe&Nakit bloğundan önce). crm-finans-
         mizan.html TZ'nin ürünü (32KB, hazır) — dosya içeriğine DOKUNULMADI, yalnız
         menü bağlantısı eklendi (domain separation: shell.js TB'de, dosya TZ'de).
         tag:'Hazırlık' — §4.3'ün "Faz 2 Finans Genişleme veya Hazırlık etiketiyle
         gösterilebilir" hükmü. Rol kararı BANKA İLE AYNI GEREKÇE: mizan firma-seviyesi
         finanstır, yalnız scr.finans kısıtı OLMAYAN roller görür (superadmin/sahip/
         yonetim/muhasebe) — teknik/sef/ik'nin scr.finans listesine EKLENMEDİ, KASITLI,
         ROLES'a dokunulmadı. */
      {seclbl:'Bütçe & Nakit', tag:'Faz 2'},
      /* [Dalga 2 / M-3a] "Proje Bütçesi" → "Şantiye Bütçesi". Bu ekran ŞANTİYE bazlıdır
         (crm-finans-butce.html'deki veri anahtarları şantiye anahtarlarıdır); M-1 ile
         gerçek Proje katmanı doğduğu için eski ad iki farklı şeyi gösteriyordu.
         Dosya adı ve ?proje= URL parametresi DEĞİŞMEDİ — yalnız etiket netleşti. */
      {ic:'fa-coins',          lbl:'Şantiye Bütçesi',      href:'crm-finans-butce.html',       screen:'butce'},
      {ic:'fa-chart-pie',      lbl:'Gerçekleşen Maliyet',  href:'crm-finans-maliyet.html',     screen:'maliyet', cnt:'1'},
      {ic:'fa-money-bill-trend-up', lbl:'Nakit Akışı',     href:'crm-finans-nakit.html',       screen:'nakit'},
      /* [v2-Dalga2/LEAD] Mizan "Sözleşmeler" grubunun ALTINDAN çıkarıldı ve listenin
         SONUNA alındı — A §6 sırasında Mizan bağımsız son kalemdir, sözleşme alt kalemi
         DEĞİLDİR. §6 ayrıca mizanın 11 kaynak modülden beslendiğini söylüyor; sözleşme
         grubunun altında durması bu bağımsızlığı yanlış anlatıyordu. href/screen/tag ve
         rol kapısı AYNEN korundu — yalnız sıra ve grup katmanı değişti. */
      {ic:'fa-scale-balanced',  lbl:'Mizan',               href:'crm-finans-mizan.html',       screen:'mizan', tag:'Hazırlık'}
    ]},
    ayarlar:{ ic:'fa-sliders', eyebrow:'Yönetim', title:'Ayarlar', menu:[
      {ic:'fa-building-user',  lbl:'Firma',            href:'crm-ayarlar-firma.html', screen:'firma'},
      {ic:'fa-users-gear',     lbl:'Kullanıcılar',     href:'crm-ayarlar-kullanicilar.html', screen:'kullanicilar'},
      {ic:'fa-user-shield',    lbl:'Roller & Yetkiler',href:'crm-ayarlar-roller.html',       screen:'roller'},
      {ic:'fa-diagram-project',lbl:'Onay Akışları',    href:'crm-ayarlar-onay.html',         screen:'onay'},
      {ic:'fa-puzzle-piece',   lbl:'Modüller',         href:'crm-ayarlar-moduller.html',     screen:'moduller'},
      {ic:'fa-plug',           lbl:'Entegrasyonlar',   href:'crm-ayarlar-entegrasyonlar.html', screen:'entegrasyonlar'},
      {ic:'fa-clock-rotate-left', lbl:'İşlem Kayıtları', href:'crm-ayarlar-log.html',        screen:'log'},
      /* [Dalga 5] §17 arşiv merkezi — sistem geneli arşivlenen kayıtların tek merkezi;
         crm-ayarlar-firma.html marka renkleri/banka/yetkili/imza gibi bir alt-akış DEĞİL,
         hiçbir ayarlar ekranından linklenmediği için kendi menü satırını gerektirir. */
      {ic:'fa-box-archive',    lbl:'Arşiv',            href:'crm-ayarlar-arsiv.html',        screen:'arsiv'},
      {seclbl:'Genişleme Modülleri'},
      /* [Dalga 6A / K-13] Faz 2 kilitli önizleme + Faz 3 planlı — ölü sayfa yasağı gereği
         gerçek hedeflere gider (crm-ayarlar-coklu-firma/cok-dil.html, d5-kilitli; AI Asistan
         crm-ayarlar-modul-kilitli.html?modul=ai-asistan roadmap tonunda, K-13 ile K-07 teaser
         yasağı geçersiz kılındı) */
      {ic:'fa-shuffle', lbl:'Çoklu Firma Yönetimi', href:'crm-ayarlar-coklu-firma.html', screen:'coklu-firma', tag:'Faz 2'},
      {ic:'fa-globe',   lbl:'Çok Dil Desteği',      href:'crm-ayarlar-cok-dil.html',     screen:'cok-dil',     tag:'Faz 2'},
      {ic:'fa-wand-magic-sparkles', lbl:'AI Asistan', href:'crm-ayarlar-modul-kilitli.html?modul=ai-asistan', tag:'Yakında'}
    ]},
    /* [D10 1.13] hesap — rail-DIŞI kişisel bölüm (RAIL_ORDER'da YOK, tüm roller erişir);
       hesap dropdown'undaki Profil / Hesap Ayarları / Bildirim Tercihleri buraya bağlanır */
    hesap:{ ic:'fa-circle-user', eyebrow:'Hesabım', title:'Hesap', menu:[
      {ic:'fa-user',           lbl:'Profil',              href:'crm-ayarlar-profil.html',          screen:'profil'},
      {ic:'fa-sliders',        lbl:'Hesap Ayarları',      href:'crm-ayarlar-hesap.html',           screen:'hesap'},
      {ic:'fa-bell',           lbl:'Bildirim Tercihleri', href:'crm-ayarlar-bildirim-tercih.html', screen:'bildirim'}
    ]},
    /* [D11] satış bölümü — 14 ekranın tamamı diskte, kilit dalga sonunda kaldırıldı */
    satis:{ ic:'fa-chart-line', eyebrow:'Satış', title:'Satış ve fırsat', menu:[
      {ic:'fa-address-card',          lbl:'Müşteriler',          href:'crm-satis-musteriler.html',  screen:'musteriler'},
      {ic:'fa-table-columns',         lbl:'Pipeline',            href:'crm-satis-pipeline.html',    screen:'pipeline', cnt:'14'},
      {ic:'fa-building-circle-check', lbl:'Bağımsız Bölümler',   href:'crm-satis-birimler.html',    screen:'birimler'},
      {ic:'fa-file-invoice-dollar',   lbl:'Teklifler',           href:'crm-satis-teklifler.html',   screen:'teklifler', cnt:'2'},
      {ic:'fa-handshake',             lbl:'Sözleşme & Teslimat', href:'crm-satis-sozlesmeler.html', screen:'sozlesmeler'},
      {ic:'fa-headset',               lbl:'Satış Sonrası',       href:'crm-satis-talepler.html',    screen:'talepler', cnt:'6'}
    ]}
  };
  /* [v3-Dalga2] spec-menu-mimarisi.md §1 — 11 bölüm birebir sıra; operasyon çıktı,
     varlik + raporlar YENİ. */
  var RAIL_ORDER = ['panel','santiye','gorev','personel','finans','satinalma','varlik','cari','raporlar','satis','ayarlar'];

  /* ---- ROL config (patron cevabı #5: superadmin + sahip demo öncelikli) ---- */
  /* [v3-Dalga2] spec §5 — ALL yeniden tanımlandı (operasyon çıktı, varlik+raporlar eklendi).
     superadmin/sahip/yonetim bu sabiti kullandığı için KOD DEĞİŞİKLİĞİ GEREKMEDİ. */
  var ALL = ['panel','santiye','gorev','personel','finans','satinalma','varlik','cari','raporlar','satis'];
  var ROLES = {
    superadmin:{ name:'Deniz Aksoy',      role:'Gavia Platform Yöneticisi', ini:'DA',
                 secs:ALL.concat(['ayarlar']), land:'crm-panel.html', tenantChip:true },
    sahip:     { name:'Kemal Yapıcıoğlu', role:'Firma Sahibi',              ini:'KY',
                 secs:ALL.concat(['ayarlar']), land:'crm-panel.html' },
    yonetim:   { name:'Murat Denizli',    role:'Genel Müdür',               ini:'MD',
                 secs:ALL, land:'crm-panel.html' },
    /* [D12] teknik/sef/muhasebe tedarik-finans delta'ları — Bölüm 3 rol matrisi birebir:
       teknik satinalma'da yalnız stok, finans'ta nakit HARİÇ; sef finans'ta yalnız taşeron
       kartları (kendi şantiyesi) + satinalma'da tedarikçi YOK; muhasebe satinalma'da yalnız
       4 yeni ekran (sipariş/irsaliye/stok/tedarikçi) */
    /* [D13] teknik/sef/muhasebe/ik panel scr'si: Yönetici Paneli (yonetici) yalnız
       superadmin+sahip+yonetim'de — bu 4 rolün görünen panel seti DEĞİŞMEDİ */
    /* [v3-Dalga2] spec §5 telafi tablosu — operasyon dağıldığı için teknik/sef/muhasebe/ik
       "hiçbir ekran kaybetmez" koşulunu korumak üzere secs/scr güncellendi (K-162 devamı). */
    teknik:    { name:'Elif Sarıkaya',    role:'Teknik Müdür',              ini:'ES',
                 secs:['panel','santiye','gorev','personel','satinalma','finans','varlik','raporlar','satis'], land:'crm-panel.html',
                 scr:{ panel:['panel','ozet','ajanda','onaylar','bildirimler','duyurular','operasyon-kiosk'],
                       /* [v3-Dalga2] teknik önceden 'personel' bölümünü HİÇ görmüyordu; artık
                          yalnız operasyon'dan taşınan 3 ekran (puantaj/taşeron-puantaj/
                          yemekhane) görünür — liste/izin/ozluk/avans/rapor KAPALI kalır. */
                       personel:['puantaj','puantaj-form','taseron-puantaj','taseron-puantaj-detay','yemekhane'],
                       satis:['talepler'], satinalma:['stok'],
                       /* kasa/kredikarti/pluxee EKLENDİ — teknik operasyon'da bunlara zaten sahipti */
                       finans:['kurum','taseron','sozlesmeler','butce','maliyet','taseronlar','sozlesme-revizyon','hakedis-onay-gecmisi','kasa','kredikarti','pluxee'] } },
    sef:       { name:'Hasan Demirci',    role:'Şantiye Şefi — Vadi Konakları', ini:'HD',
                 secs:['panel','santiye','gorev','personel','satinalma','finans','varlik','raporlar'], land:'crm-panel.html',
                 scr:{ panel:['panel','ozet','ajanda','onaylar','bildirimler','duyurular','operasyon-kiosk'],
                       satinalma:['talepler','formlar','siparisler','termin','irsaliye','stok'],
                       /* [Dalga 6A] 'taseron' EKLENDİ — crm-finans-hakedis-detay.html'in kendi
                          VADI_TH/VADI_HKD budama mantığı sef için zaten yazılmıştı ama
                          data-screen="taseron" (Taşeron Hakedişleri, TEKİL) burada yalnız
                          "taseronlar" (Taşeron Kartları, ÇOĞUL) tanımlıydı — isim uyuşmazlığı
                          sef'i kendi şantiyesinin TH kaydına bile sokmuyordu (bkz. karar dosyası)
                          [v3-Dalga2] kasa/kredikarti/pluxee EKLENDİ (operasyon'dan telafi). */
                       finans:['taseron','taseronlar','kasa','kredikarti','pluxee'] } },
    muhasebe:  { name:'Nesrin Aydın',     role:'Muhasebe',                  ini:'NA',
                 /* [Dalga 20 / H2a] 'gorev' EKLENDİ — §11.1 Muhasebe Departmanı görev havuzu
                    + §11.2 "yalnız o departman görür" hükmü, muhasebe gorev bölümünü hiç
                    göremeden uygulanamazdı. scr.gorev TANIMLANMADI (kısıt yok, tüm liste görünür). */
                 secs:['panel','gorev','satinalma','cari','finans','personel','varlik','raporlar'], land:'crm-panel.html',
                 /* [v3-Dalga2] finans zaten scr.finans TANIMSIZ (full) → kasa/kredikarti/pluxee
                    otomatik dahil oldu, kod değişikliği gerekmedi. personel de zaten full →
                    puantaj/taşeron-puantaj/yemekhane otomatik. varlik YENİ, scr.varlik
                    TANIMLANMADI (full — muhasebe operasyon'da arac/demirbas/makine'yi zaten
                    tam görüyordu). */
                 scr:{ panel:['panel','ozet','ajanda','onaylar','bildirimler','duyurular','operasyon-kiosk'],
                       satinalma:['siparisler','irsaliye','stok','tedarikciler'] } },
    satinalma: { name:'Baran Yıldız',     role:'Satın Alma Sorumlusu',      ini:'BY',
                 secs:['panel','satinalma','cari','gorev'], land:'crm-panel.html',
                 scr:{ panel:['panel','ozet','ajanda','onaylar','bildirimler','duyurular','operasyon-kiosk'] } },
    ik:        { name:'Seda Karaca',      role:'İK Uzmanı',                 ini:'SK',
                 /* [v3-Dalga2] operasyon çıktı; varlik + finans(kısıtlı) + raporlar EKLENDİ
                    (spec §5 ik satırı). personel ARTIK scr İLE BUDANIYOR — önceden operasyon
                    scr'sinde yemekhane/taşeron-puantaj/makine YOKTU, personel full olsaydı
                    ik bunları YENİ KAZANMIŞ olurdu (kabul kriteri ihlali) — bu yüzden
                    scr.personel açıkça sınırlandı. */
                 secs:['panel','personel','gorev','varlik','finans','raporlar'], land:'crm-panel.html',
                 /* [Dalga 5] araç/puantaj alt-akışları (form/arşiv/bakım/evrak/kullanım)
                    'arac'/'puantaj' temel ekranlarının aksine KENDİ benzersiz data-screen
                    kimliğini kullanıyor (demirbaş-form/detay gibi ana ekranı MİRASLAMIYOR) —
                    bu yüzden ik'nin zaten sahip olduğu arac/puantaj görünürlüğü BURADA
                    açıkça tekrarlanmazsa scrOk bu alt-ekranları 403'e düşürür.
                    [Dalga 4 / Araç-Demirbaş] AYNI sebepten araç/demirbaş alt-ekranları
                    EKLENDİ — arac-yakit/arac-gider ve demirbas-kategori/
                    demirbas-etiket hepsi KENDİ benzersiz data-screen
                    kimliğini taşıyor (ana ekranı miraslamıyor), ik zaten araç/demirbaş
                    görüyor — eklenmezse hepsinde 403'e düşerdi. [v3-Dalga2] 'makine'
                    BİLİNÇLİ EKLENMEDİ — ik bunu operasyon'da da hiç görmüyordu
                    (spec §5 notu). Bu listenin Bölüm 2.7'de kısalan hâli için alttaki
                    [R-31/R-36] notuna bak. */
                 /* [Bölüm 2.7 · R-31/R-36] Listeden DÜŞENLER ve sebebi:
                      · 'demirbas-marka'     → sayfa Kategori Yönetimi'ne sekme olarak
                                               birleşti (R-31), ekran kimliği kalmadı.
                      · 'arac-dashboard' /
                        'demirbas-dashboard' → sayfalar SİLİNDİ (R-36); özet göstergeler
                                               ana listelerin "Grafikler" sekmesinde.
                    KALANLAR bilinçli: 'arac-bakim'/'arac-evrak'/'demirbas-etiket' menüden
                    çıktı ama SAYFALARI duruyor (alt-akış) — ik bu ekranlara ana kayıttan
                    girmeye devam ediyor, o yüzden scr listesinde KALMALI.
                    'arac-bildirim'/'demirbas-bildirim' de DÜŞTÜ: Beyar kararıyla iki sayfa
                    silindi. Eşik/kanal ayarları önce Ayarlar > Bildirim Tercihleri'ne
                    taşındı (ayar kaybolmadı, sayfa kayboldu); ik o ekrana `hesap`
                    bölümünden erişiyor, varlık scr listesinde karşılığı gerekmiyor. */
                 scr:{ panel:['panel','ozet','ajanda','onaylar','bildirimler','duyurular','operasyon-kiosk'],
                       varlik:['demirbas','arac','arac-form','arac-arsiv','arac-bakim','arac-evrak','arac-kullanim',
                                  'arac-yakit','arac-gider',
                                  'demirbas-kategori','demirbas-etiket'],
                       finans:['kasa','pluxee'],
                       personel:['liste','izin','rapor','avans','ozluk','puantaj','puantaj-form'] } },
    personel:  { name:'Ali Vural',        role:'Saha Personeli',            ini:'AV',
                 secs:['panel','gorev'], land:'crm-panel.html',
                 scr:{ panel:['panel','ozet','ajanda','onaylar','bildirimler','duyurular','operasyon-kiosk'] } },
    /* [D11] satış personaları (9→11) — indirim zinciri: %0–3 temsilci · %3–7 müdür · %7+ GM */
    satistemsilci:{ name:'Selin Acar',    role:'Satış Temsilcisi',          ini:'SA',
                 secs:['panel','gorev','satis'], land:'crm-panel.html',
                 scr:{ panel:['panel','ozet','ajanda','onaylar','bildirimler','duyurular','operasyon-kiosk'] } },
    satismudur:{ name:'Okan Eren',        role:'Satış Müdürü',              ini:'OE',
                 secs:['panel','gorev','satis','cari'], land:'crm-panel.html',
                 scr:{ panel:['panel','ozet','ajanda','onaylar','bildirimler','duyurular','operasyon-kiosk'] } }
  };
  /* scr = ekran-seviyesi budama (4C): bölüm İÇİNDE rolün görebildiği data-screen
     listesi. Tanımsızsa bölümün tamamı görünür (bölüm-seviyesi RBAC aynen).
     Listedeki kısıt: menü öğesi gizlenir + sayfa guard'ı landing'e döndürür.
     screen'siz menü öğeleri (çapraz linkler, ör. Görevlerim) budamadan MUAF.
     crm-ayarlar-roller.html matrisi bu kısıtları "kısmi" rozetiyle YANSITIR — senkron tut. */

  /* ---- rol çöz (param > localStorage > superadmin) ---- */
  var q = new URLSearchParams(location.search);
  var role = q.get('role');
  if(role && ROLES[role]){ try{localStorage.setItem('gv_crm_role', role);}catch(e){} }
  else { try{role = localStorage.getItem('gv_crm_role');}catch(e){} }
  if(!ROLES[role]) role = 'superadmin';
  var R = ROLES[role];

  /* [Dalga 20 / T-GOREV-01] Havuz rozeti ARTIK rol-duyarlı ve TÜREV — hiçbir sayı
     sabit yazılmaz, GOREV_HAVUZ meta-verisinden + claim sayısından hesaplanır (böylece
     ileride görev eklenince kendiliğinden düzelir). Önceden yalnız 'personel' rolü
     D8'de özel olarak '1'e sabitleniyordu; rail rozeti BAŞKA HİÇBİR rolde departman
     filtresini yansıtmıyordu — sayfa içi sayaç doğruydu, rail rozeti YANLIŞTI. Bu,
     müşterinin 6 Tem Faz 1 Eksikleri brief'inde işaret ettiği "KPI ≠ tablo" hata
     sınıfıdır — kozmetik SAYILMAZ, bu yüzden düzeltildi. Şimdi TÜM roller aynı
     formülü kullanır (personel'in tek-şantiye evreni de formülün İÇİNDE, özel dal).

     KRİTİK: crm-gorev.html'in §11.2 departman-görünürlük kuralı (canSeeHavuzRow —
     MGMT_ROLES/DEPT_ROLE_MAP/NOFILTER_DEPTS/SITE_SCOPED_ROLES) BURADA BİREBİR
     MIRROR'LANIR — rail HER sayfada render edildiği için crm-gorev.html'in DOM'unu
     okuyamaz, meta-veri iki dosyada AYRI AYRI tutulur. Biri değişirse diğeri elle
     güncellenmeli (otomatik senkron YOK — iki dosya ayrı sahipte). */
  var GOREV_HAVUZ = [
    {id:'021', slug:'liman-cevre-aydinlatma-kesfi',      title:'Liman Lojistik çevre aydınlatma keşfi',              dept:'satinalma', santiye:'liman',  santiyeAd:'Liman Lojistik Merkezi'},
    {id:'022', slug:'kule-kesin-hesap-kontrolu',          title:'Kule Ofis kesin hesap dosyası kontrolü',             dept:'muhasebe',  santiye:'kule',   santiyeAd:'Kule Ofis B Blok'},
    {id:'023', slug:'vadi-numune-daire-fotograf',         title:'Vadi Konakları numune daire fotoğraf çekimi',        dept:'satis',     santiye:'vadi',   santiyeAd:'Vadi Konakları'},
    {id:'024', slug:'merkez-yil-ortasi-sayim',            title:'Merkez depo yıl ortası sayım planı',                 dept:'depo',      santiye:'merkez', santiyeAd:'Merkez Şantiye'},
    {id:'025', slug:'gol-evleri-ruhsat-evrak',            title:'Göl Evleri 2. Etap ruhsat evrak listesi',            dept:'teknik',    santiye:'gol',    santiyeAd:'Göl Evleri 2. Etap'},
    {id:'026', slug:'arac-takip-cizelgesi',               title:'Şantiye araç takip çizelgesi güncelleme',            dept:'sef',       santiye:'merkez', santiyeAd:'Merkez Şantiye'},
    /* [T-GOREV-02] 2 yeni kanonik havuz görevi — ik ve yonetim havuzlarını doldurur
       (önceden boştu). GRV-2026-030/031, crm-gorev.html'de gerçek satır olarak var. */
    {id:'030', slug:'merkez-ozluk-evrak-kontrolu',        title:'Merkez Şantiye personel özlük evrak eksik kontrolü', dept:'ik',        santiye:'merkez', santiyeAd:'Merkez Şantiye'},
    {id:'031', slug:'gol-evleri-yatirim-komitesi-sunumu', title:'Göl Evleri 2. Etap yatırım komitesi sunum hazırlığı',dept:'yonetim',   santiye:'gol',    santiyeAd:'Göl Evleri 2. Etap'}
  ];
  var GOREV_POOL = GOREV_HAVUZ.map(function(t){ return t.slug; });
  var MGMT_ROLES = ['superadmin','sahip','yonetim'];
  var DEPT_ROLE_MAP = { muhasebe:['muhasebe'], ik:['ik'], satinalma:['satinalma'], teknik:['teknik'],
    sef:['sef'], satis:['satistemsilci','satismudur'], yonetim:[] };
  var NOFILTER_DEPTS = ['saha','isg','depo','taseron'];
  var SITE_SCOPED_ROLES = { sef:'vadi' };
  function canSeeHavuzTask(t, r){
    if(MGMT_ROLES.indexOf(r) !== -1) return true;
    if(NOFILTER_DEPTS.indexOf(t.dept) !== -1) return r === 'teknik' || r === 'sef';
    var allowed = DEPT_ROLE_MAP[t.dept] || [];
    if(allowed.indexOf(r) === -1) return false;
    var scoped = SITE_SCOPED_ROLES[r];
    if(t.santiye && scoped && scoped !== t.santiye) return false;
    return true;
  }
  /* D8: personel havuzda YALNIZ kendi şantiyesindeki tek görevi görür (departman
     kuralına GİRMEZ — crm-gorev.html'de de actor='personel' tekil satırla ayrı
     ele alınıyor, bu fonksiyon o davranışın shell.js karşılığıdır).
     [T-PANEL] gorevPoolVisibleList TEK KAYNAK — hem sayı (rail rozeti) hem liste
     (panel widget'ı) BURADAN türer, iki ayrı hesap YOK. */
  function gorevPoolVisibleList(r){
    if(r === 'personel'){
      return GOREV_HAVUZ.filter(function(t){ return t.slug === 'vadi-numune-daire-fotograf'; });
    }
    return GOREV_HAVUZ.filter(function(t){ return canSeeHavuzTask(t, r); });
  }
  function gorevPoolVisibleCount(r){
    return gorevPoolVisibleList(r).length;
  }

  /* D15: görev havuzu "Üzerime Al" claim'leri (localStorage gv_gorev_claims —
     crm-gorev + crm-panel yazar) menü rozetlerine yansır: Havuz düşer, Bana
     Verilenler artar. Slug listesi kanonik 8 havuz göreviyle birebir; personel
     havuzda yalnız Vadi görevini gördüğünden onun evreni tek slug'dır. */
  function gorevClaims(){
    var arr;
    try{ arr = JSON.parse(localStorage.getItem('gv_gorev_claims')) || []; }catch(e){ arr = []; }
    var uni = role === 'personel' ? ['vadi-numune-daire-fotograf'] : GOREV_POOL;
    return arr.filter(function(s){ return uni.indexOf(s) !== -1; });
  }
  (function(){
    var _hv = SECTIONS.gorev.menu.filter(function(m){ return m.screen === 'havuz'; })[0];
    if(!_hv) return;
    var visible = gorevPoolVisibleCount(role) - gorevClaims().length;
    _hv.cnt = visible > 0 ? String(visible) : '';   /* 0 ise rozet HİÇ basılmaz */
  })();

  /* D12: şef sipariş listesinde yalnız kendi şantiyesini (Vadi) görür — menü sayacı
     budanmış açık sipariş sayısıyla tutarlı (5 → 2: SIP-05 kısmi + SIP-07 onaylandı) */
  if(role === 'sef'){
    SECTIONS.satinalma.menu.forEach(function(m){
      if(m.screen === 'siparisler') m.cnt = '2';
    });
  }

  /* D11: satış temsilcisi liste sayfalarında yalnız kendi kayıtlarını görür —
     menü sayaçları budanmış setle tutarlı (açık fırsat 6 · onay bekleyen teklif 1) */
  if(role === 'satistemsilci'){
    SECTIONS.satis.menu.forEach(function(m){
      if(m.screen === 'pipeline')  m.cnt = '6';
      if(m.screen === 'teklifler') m.cnt = '1';
    });
  }

  /* ---- bölüm çöz + yetki guard'ı ---- */
  var sec = document.body.dataset.sec || 'panel';
  var screen = document.body.dataset.screen || null;
  /* 'hesap' rail-dışı kişisel bölüm — her rol kendi profiline erişir (D10 1.13) */
  /* [Dalga 6A / A-03 onarımı] Önceden sessizce R.land'e (crm-panel.html) atıyordu —
     kullanıcı kendi işleminin/isteğinin SONUCUNU hiç göremiyordu (doküman §6.8 ihlali).
     Artık gerçek bir 403 ekranına gider (crm-sistem-403.html, kabuksuz — shell.js hiç
     yüklemez, döngü riski YOK). 'giris'/'hesap' muaf kalmaya devam eder; crm-sistem-* ve
     crm-auth-* aileleri zaten shell.js'i hiç include ETMEDİĞİ için bu guard'a hiç girmez. */
  if(sec !== 'giris' && sec !== 'hesap' && R.secs.indexOf(sec) === -1){ location.replace('crm-sistem-403.html?hedef='+encodeURIComponent(sec)); return; }
  /* ekran-seviyesi guard (scr) — kısıtlı bölümde liste-dışı ekrana erişim de artık 403'e gider */
  function scrOk(secKey, m){
    var lim = R.scr && R.scr[secKey];
    return !lim || !m.screen || lim.indexOf(m.screen) !== -1;
  }
  if(sec !== 'giris' && screen && !scrOk(sec, {screen:screen})){ location.replace('crm-sistem-403.html?hedef='+encodeURIComponent(sec+'/'+screen)); return; }
  var S = SECTIONS[sec];

  window.GV = { role:role, R:R, sec:sec, screen:screen, STR:STR };
  if(sec === 'giris') return;   /* giriş sayfası yalnız rol motorunu kullanır */

  /* ---- 1) rail render ---- */
  var railEl = document.getElementById('gvRail');
  if(railEl){
    var h = '<a class="gv-rail-logo" href="index.html" data-tip="'+STR.brand+'">G</a>'
          + '<span class="gv-rail-div"></span>';
    RAIL_ORDER.forEach(function(key){
      var X = SECTIONS[key];
      if(R.secs.indexOf(key) === -1) return;
      /* rail linki rolün GÖREBİLDİĞİ ilk ekrana gider (scr budaması dahil) */
      var vis = X.menu.filter(function(m){return m.href && scrOk(key, m);});
      if(!vis.length) return;   /* rolün hiç ekranı yoksa bölüm ikonu çizilmez */
      h += '<a class="gv-rail-ico'+(key===sec?' is-active':'')+'" data-sec="'+key+'" href="'+vis[0].href+'" data-tip="'+X.title+'"><i class="fa-solid '+X.ic+'"></i></a>';
    });
    h += '<div class="gv-rail-foot">'
       + '<a class="gv-sig" href="https://gaviaworks.com" target="_blank" rel="noopener" data-tip="gaviaworks.com">GAVIA</a>'
       + '</div>';
    railEl.innerHTML = h;
  }

  /* ---- 2) bölüm menüsü render ---- */
  var menuEl = document.getElementById('gvMenu');
  if(menuEl){
    var mh = '<div class="gv-menu-head"><span class="gmh-eyebrow">'+S.eyebrow+'</span><span class="gmh-title">'+S.title+'</span></div><div class="gv-mnav">';
    /* scr budaması: gizlenen öğeler + altı boşalan bölüm başlıkları menüden düşer */
    /* [K-17] reqSec/reqScreen: başka bölüme giden çapraz-link kalemi, yalnız rolün o
       bölüme (ve varsa o ekrana) GERÇEKTEN erişimi varsa görünür — screen'siz kalemlerin
       genel muafiyetinden bilinçli AYRIŞIR (bkz. Cari > Taşeronlar/Tedarikçiler) */
    function reqOk(m){
      if(!m.reqSec) return true;
      if(R.secs.indexOf(m.reqSec) === -1) return false;
      return !m.reqScreen || scrOk(m.reqSec, {screen:m.reqScreen});
    }
    var mlist = S.menu.filter(function(m){ return m.seclbl || (scrOk(sec, m) && reqOk(m)); });
    mlist = mlist.filter(function(m, i){ return !m.seclbl || (mlist[i+1] && !mlist[i+1].seclbl); });
    mlist.forEach(function(m){
      if(m.seclbl){ mh += '<div class="gv-msec">'+m.seclbl+(m.tag?' <span style="opacity:.7;text-transform:none;letter-spacing:0">· '+m.tag+'</span>':'')+'</div>'; return; }
      var isActive = screen && m.screen === screen;
      var cls = 'gv-mlink'+(isActive?' is-active':'');
      /* .ml-cnt sayı rozetiyle AYNI kalıp, Faz etiketleri için nötr tonda (K-13/§27.4:
         etiket metinleri tek yerden — burası) */
      var tail = m.cnt ? '<span class="ml-cnt">'+m.cnt+'</span>' : '';
      if(m.tag) tail += '<span class="ml-cnt" style="background:var(--gv-border-dark);color:var(--on-dark)">'+m.tag+'</span>';
      mh += '<a class="'+cls+'" href="'+(m.href||'#')+'"><i class="fa-solid '+m.ic+'"></i> '+m.lbl+tail+'</a>';
    });
    mh += '</div><div class="gv-menu-foot">'
        + '<a class="gv-mlink" href="index.html"><i class="fa-solid fa-right-from-bracket"></i> '+STR.logout+'</a>'
        + '</div>';
    menuEl.innerHTML = mh;
  }

  /* ---- 2b) breadcrumb (D18 Y16 / DK4, kilit istisnası DK11) ----
     "Bölüm › Modül [› Kayıt]" satırı her shell sayfasının main başına buradan
     basılır — sayfa dokunuşu gerekmez. Modül = aktif menü öğesi (detay sayfaları
     data-screen'i liste ekranına işaret ettiğinden liste etiketi çıkar). Kayıt
     segmenti: detay sayfası param'ını çözünce GV.crumb('GRV-2026-008') çağırır
     (statik alternatif: body[data-crumb]); kayıt eklenince modül metni listeye
     dönen linke yükselir. Mobil sadeleşme shell.css'te (bölüm segmenti gizlenir). */
  var crumbMain = document.querySelector('main.gv-main');
  var crumbNav = null, crumbMod = null;
  /* GEÇİŞ UYUMLULUĞU: 47 detay/form sayfasında D17-öncesi sayfa-lokal .gv-crumb
     idiyomu var — çift kırıntı basmamak için shell kendi satırını o sayfalarda
     BASTIRIR. Y16 yayılımı: lokaller GV.crumb'a devroldukça bu koşul kendiliğinden
     devreden çıkar (dönüşüm envanteri D18 iç planında). */
  if(document.querySelector('.gv-crumb')) crumbMain = null;
  if(crumbMain && S){
    var crumbVis = S.menu.filter(function(m){ return m.href && scrOk(sec, m); });
    S.menu.forEach(function(m){ if(!crumbMod && !m.seclbl && screen && m.screen === screen) crumbMod = m; });
    crumbNav = document.createElement('nav');
    crumbNav.className = 'gv-crumbs';
    crumbNav.setAttribute('aria-label', 'Sayfa yolu');
    var crumbH = crumbVis[0]
      ? '<a class="gvc-sec" href="'+crumbVis[0].href+'">'+S.title+'</a>'
      : '<span class="gvc-sec">'+S.title+'</span>';
    if(crumbMod) crumbH += '<i class="fa-solid fa-chevron-right gvc-sep"></i><span class="gvc-mod">'+crumbMod.lbl+'</span>';
    crumbNav.innerHTML = crumbH;
    crumbMain.insertBefore(crumbNav, crumbMain.firstChild);
  }
  GV.crumb = function(lbl){
    if(!crumbNav) return;
    var oldK = crumbNav.querySelector('.gvc-kayit'), oldS = crumbNav.querySelector('.gvc-sep-kayit');
    if(oldK) oldK.remove();
    if(oldS) oldS.remove();
    if(!lbl) return;
    /* kayıt segmenti gelince modül, listeye dönen linke yükselir (son kırıntı = düz metin kuralı) */
    var modEl = crumbNav.querySelector('.gvc-mod');
    if(modEl && crumbMod && crumbMod.href && modEl.tagName !== 'A'){
      var modA = document.createElement('a');
      modA.className = 'gvc-mod'; modA.href = crumbMod.href; modA.textContent = modEl.textContent;
      modEl.replaceWith(modA);
    }
    var sepEl = document.createElement('i');
    sepEl.className = 'fa-solid fa-chevron-right gvc-sep gvc-sep-kayit';
    var kEl = document.createElement('span');
    kEl.className = 'gvc-kayit'; kEl.textContent = lbl;
    crumbNav.appendChild(sepEl); crumbNav.appendChild(kEl);
  };
  if(document.body.dataset.crumb) GV.crumb(document.body.dataset.crumb);

  /* D15: Havuz/Bana Verilenler rozetlerini claim'lere göre düzeltir; claim anında
     (sayfa yenilenmeden) düşmesi için crm-gorev/crm-panel de çağırır. Yalnız görev
     menüsünde iş yapar — panel menüsündeki "Görevlerim" çapraz linkine dokunmaz. */
  GV.syncGorevBadges = function(){
    if(sec !== 'gorev' || !menuEl) return;
    var n = gorevClaims().length;
    function setCnt(link, val){
      if(!link) return;
      var sp = link.querySelector('.ml-cnt');
      if(val <= 0){ if(sp) sp.remove(); return; }
      if(!sp){ sp = document.createElement('span'); sp.className = 'ml-cnt'; link.appendChild(sp); }
      sp.textContent = val;
    }
    /* [T-GOREV-01] artık rol-duyarlı formülle AYNI kaynak — sabit '6'/'1' hardcode YOK */
    setCnt(menuEl.querySelector('.gv-mlink[href^="crm-gorev.html?f=havuz"]'),
      gorevPoolVisibleCount(role) - n);
    /* personel'in "Bana Verilenler" rozeti global 7 kanoniği — claim'le artmaz (kendi listesi ayrı) */
    if(role !== 'personel') setCnt(menuEl.querySelector('.gv-mlink[href^="crm-gorev.html?f=bana"]'), 7 + n);
  };
  GV.syncGorevBadges();

  /* [T-PANEL] Havuz API'si — kural TEK KAYNAKTA (bu dosya) kalsın diye açılıyor.
     crm-panel.html (ve gerekirse başka sayfalar) KENDİ kopyasını YAZMAZ, bu 3
     erişim noktasını kullanır. GOREV_HAVUZ / canSeeHavuzTask / gorevPoolVisibleList
     zaten YUKARIDA tanımlı (bkz T-GOREV-01/02) — burada yalnız GV'ye BAĞLANIYOR.
     Değişirse (yeni görev/departman) tek yerden (GOREV_HAVUZ + canSeeHavuzTask)
     güncellenir, üç sayfa da (rail, crm-gorev.html, panel) otomatik senkron kalır
     — crm-gorev.html kendi canSeeHavuzRow'unu KORUR (ayrı dosya, ayrı sahip),
     yalnız KURAL MANTIĞI aynı kalacak şekilde elle senkron tutulur (bkz üstteki not). */
  GV.GOREV_HAVUZ = GOREV_HAVUZ;
  GV.gorevPoolVisible = function(r){ return gorevPoolVisibleList(r); };
  GV.canSeeHavuzTask = function(r, gorevId){
    var t = GOREV_HAVUZ.filter(function(x){ return x.id === gorevId; })[0];
    if(!t) return false;
    if(r === 'personel') return t.slug === 'vadi-numune-daire-fotograf';
    return canSeeHavuzTask(t, r);
  };

  /* ---- 3) topbar: persona + tenant çipi + dil çipi ---- */
  var nameEl = document.getElementById('gvName'), roleEl = document.getElementById('gvRole'), avaEl = document.getElementById('gvAva');
  if(nameEl) nameEl.textContent = R.name;
  if(roleEl) roleEl.textContent = R.role;
  if(avaEl) avaEl.textContent = R.ini;

  var searchInp = document.querySelector('.gv-search input');
  if(searchInp) searchInp.placeholder = STR.search;

  /* tenant çipi — yalnız superadmin (kiralanabilirlik sinyali; [D13] Firma değiştir
     → Gavia Platform Konsolu firma listesine gerçek link) */
  if(R.tenantChip){
    var top = document.querySelector('.gv-top'), search = document.querySelector('.gv-search');
    if(top && search){
      var tn = document.createElement('div');
      tn.className = 'gv-tenant';
      tn.setAttribute('role','button'); tn.setAttribute('tabindex','0');
      tn.setAttribute('aria-haspopup','true'); tn.setAttribute('aria-expanded','false');
      tn.innerHTML = '<span class="tn-dot"></span><span class="tn-lbl">'+STR.tenant+'</span><i class="fa-solid fa-chevron-down"></i>'
        + '<div class="gv-pop" id="gvTenantPop">'
        +   '<div class="gp-head"><b>'+STR.tenant+'</b><span>'+STR.tenantPlan+' · 18 kullanıcı</span></div>'
        +   '<a href="crm-ayarlar-firma.html"><i class="fa-solid fa-building-user"></i> '+STR.firmSettings+'</a>'
        +   '<div class="gp-div"></div>'
        +   '<a href="gavia-firmalar.html"><i class="fa-solid fa-shuffle"></i> '+STR.switchTenant+'</a>'
        + '</div>';
      top.insertBefore(tn, search.nextSibling);
      var pop = tn.querySelector('.gv-pop');
      function setTn(o){ pop.classList.toggle('open',o); tn.setAttribute('aria-expanded', o?'true':'false'); }
      tn.addEventListener('click', function(e){
        if(e.target.closest('.gv-pop')) return;
        setTn(!pop.classList.contains('open'));
      });
      tn.addEventListener('keydown', function(e){
        if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setTn(!pop.classList.contains('open')); }
        else if(e.key==='Escape') setTn(false);
      });
      document.addEventListener('click', function(e){ if(!tn.contains(e.target)) setTn(false); });
    }
  }

  /* topbar zili → bildirim merkezi (Dalga 3)
     [D10 1.13/K6] TR dil çipi KALDIRILDI idi — [Dalga 6A] CLAUDE.md'nin öngördüğü "pasif
     dil düğmesi (TR çipi, kilitli — çok-dil Faz 2+)" artık gerçek bir hedefe (d5-kilitli'nin
     crm-ayarlar-cok-dil.html'i) sahip olduğundan, K-13 ("Faz 2 kalemi tıklanınca ölü değil
     gerçek önizlemeye gider") gereği geri getirildi. Yalnız 'ayarlar' erişimi olan SA/SH
     görür — dil, firma-seviyesi bir ayardır. */
  var tools = document.querySelector('.gv-top-tools');
  if(tools){
    if(R.secs.indexOf('ayarlar') !== -1){
      var langBtn = document.createElement('a');
      langBtn.className = 'gv-iconbtn';
      langBtn.href = 'crm-ayarlar-cok-dil.html';
      langBtn.setAttribute('data-tip', 'Çok Dil — Faz 2 önizleme');
      langBtn.innerHTML = '<span style="font-size:11px;font-weight:800;letter-spacing:.01em">TR</span>';
      tools.insertBefore(langBtn, tools.firstChild);
    }
    var bell = tools.querySelector('.gv-iconbtn[data-tip="'+STR.notif+'"]');
    if(bell){ bell.addEventListener('click', function(){ location.href = 'crm-panel-bildirimler.html'; }); }
  }

  /* ---- hesap menüsü içeriği (ui.js tüketir) — [D10 1.13] 3 gerçek sayfa ---- */
  window.GV_ACCOUNT_ITEMS = [
    {ic:'fa-regular fa-user',  lbl:'Profil',              href:'crm-ayarlar-profil.html'},
    {ic:'fa-solid fa-sliders', lbl:'Hesap Ayarları',      href:'crm-ayarlar-hesap.html'},
    {ic:'fa-regular fa-bell',  lbl:'Bildirim Tercihleri', href:'crm-ayarlar-bildirim-tercih.html'},
    {div:true},
    {ic:'fa-solid fa-right-from-bracket', lbl:STR.logout, href:'index.html', danger:true}
  ];

  /* ---- mobil drawer ---- */
  var burger = document.getElementById('gvBurger'), overlay = document.getElementById('gvOverlay');
  if(burger) burger.addEventListener('click', function(){ document.body.classList.toggle('nav-open'); });
  if(overlay) overlay.addEventListener('click', function(){ document.body.classList.remove('nav-open'); });
  if(q.get('nav') === '1') document.body.classList.add('nav-open');

  /* ---- divider grip — menüyü katla/aç (localStorage'da kalıcı) ---- */
  (function(){
    var div = document.getElementById('gvDivider');
    try{ if(localStorage.getItem('gv_crm_menu')==='collapsed') document.body.classList.add('gv-collapsed'); }catch(e){}
    if(!div) return;
    function isC(){ return document.body.classList.contains('gv-collapsed'); }
    function set(c){
      document.body.classList.toggle('gv-collapsed', c);
      try{ localStorage.setItem('gv_crm_menu', c?'collapsed':'open'); }catch(e){}
    }
    var dragging=false, startX=0, moved=false;
    div.addEventListener('pointerdown', function(e){
      dragging=true; moved=false; startX=e.clientX; div.classList.add('is-drag');
      try{ div.setPointerCapture(e.pointerId); }catch(_){}
    });
    div.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var dx = e.clientX - startX;
      if(Math.abs(dx) > 5) moved = true;
      if(dx < -26 && !isC()) set(true);
      else if(dx > 26 && isC()) set(false);
    });
    function end(){ if(dragging && !moved) set(!isC()); dragging=false; div.classList.remove('is-drag'); }
    div.addEventListener('pointerup', end);
    div.addEventListener('pointercancel', end);
  })();
})();
