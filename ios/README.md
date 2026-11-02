# متصفح العالمي — آيفون (iOS 17+)

تطبيق SwiftUI + WKWebView. كل حساب له مخزن بيانات منفصل `WKWebsiteDataStore(forIdentifier:)`
(كوكيز وتخزين معزول)، وتصفح خفي بمخزن مؤقت، ترجمة، وضع سطح المكتب، تنزيلات لتطبيق الملفات، وتحديثات من السيرفر.

## ليه مفيش ملف جاهز للتثبيت؟
أبل لا تسمح بتثبيت أي تطبيق على الآيفون إلا لو كان موقّعًا بحساب Apple، والبناء يحتاج جهاز ماك (Xcode).

## الطرق المتاحة
1. **App Store / TestFlight (للنشر للناس)**: حساب Apple Developer بـ 99 دولار سنويًا + ماك (أو خدمة بناء سحابية مثل Codemagic).
   على الماك: `brew install xcodegen && xcodegen generate && open AlalamyBrowser.xcodeproj` ← اختر فريقك ← Product ← Archive ← رفع.
2. **بدون ماك ومجانًا لجهازك فقط**: ارفع المجلد على GitHub، شغّل الـ workflow الموجود في `.github/workflows/ios.yml`
   فيبني `AlalamyBrowser-unsigned.ipa` على ماك مجاني من GitHub، ثم ثبّته على جهازك بـ **Sideloadly** أو **AltStore**
   بحساب Apple ID عادي (تحتاج تعيد التوقيع كل 7 أيام).

ملاحظة: الكود مكتوب ولم يُجرَّب على Xcode بعد، فقد يحتاج تعديلات بسيطة عند أول بناء.
