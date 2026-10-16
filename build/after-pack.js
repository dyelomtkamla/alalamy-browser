'use strict';
// يضع أيقونة البرنامج ومعلوماته داخل ملف exe بدون الحاجة لـ wine
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const pe = await import('pe-library');
  const { productFilename } = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const exe = pe.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = pe.NtExecutableResource.from(exe);

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const lang = groups.length ? groups[0].lang : 1033;
  const id = groups.length ? groups[0].id : 1;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, iconFile.icons.map(i => i.data));

  const version = context.packager.appInfo.version;
  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const parts = version.split('.').map(Number);
  vi.setFileVersion(...parts, 0, 1033);
  vi.setProductVersion(...parts, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'متصفح العالمي',
    ProductName: 'متصفح العالمي',
    CompanyName: 'Ahmed Gamal Elshafey',
    InternalName: productFilename,
    OriginalFilename: `${productFilename}.exe`,
    FileVersion: version,
    ProductVersion: version,
    LegalCopyright: '© 2026 Ahmed Gamal Elshafey. جميع الحقوق محفوظة'
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
};
