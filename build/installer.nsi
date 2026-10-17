; برنامج تثبيت متصفح العالمي
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APPNAME "متصفح العالمي"
!define COPYRIGHT "© 2026 Ahmed Gamal Elshafey. جميع الحقوق محفوظة"
!define EXENAME "AlalamyBrowser.exe"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\AlalamyBrowser"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef SRCDIR
  !define SRCDIR "..\dist\win-unpacked"
!endif

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\AlalamyBrowser"
InstallDirRegKey HKCU "Software\AlalamyBrowser" "InstallDir"
RequestExecutionLevel user
BrandingText "${COPYRIGHT}"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "تشغيل ${APPNAME} الآن"

!define MUI_WELCOMEPAGE_TITLE "مرحباً بك في تثبيت ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "سيقوم هذا البرنامج بتثبيت ${APPNAME} على جهازك، ويضع أيقونته على سطح المكتب وفي قائمة ابدأ.$\r$\n$\r$\nاضغط «التالي» للمتابعة.$\r$\n$\r$\n$\r$\n${COPYRIGHT}"
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE EnsureSubdir
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Arabic"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_ARABIC} "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=${LANG_ARABIC} "FileDescription" "تثبيت ${APPNAME}"
VIAddVersionKey /LANG=${LANG_ARABIC} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_ARABIC} "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_ARABIC} "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey /LANG=${LANG_ARABIC} "CompanyName" "Ahmed Gamal Elshafey"

; لو اختار المستخدم مجلداً عاماً نضيف مجلداً خاصاً بالبرنامج حتى لا تمسح الإزالة ملفات أخرى
Function EnsureSubdir
  StrCpy $0 $INSTDIR 14 -14
  StrCmp $0 "AlalamyBrowser" +2
  StrCpy $INSTDIR "$INSTDIR\AlalamyBrowser"
FunctionEnd

Section "Install"
  ; إغلاق المتصفح لو كان مفتوحاً قبل التحديث
  nsExec::Exec 'taskkill /F /IM ${EXENAME}'
  Sleep 500
  SetOutPath "$INSTDIR"
  File /r "${SRCDIR}\*.*"
  File "icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}\إزالة ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\AlalamyBrowser" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "Ahmed Gamal Elshafey"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1

  ; تسجيله كمتصفح عند ويندوز حتى يظهر في «التطبيقات الافتراضية»
  !define SMI "Software\Clients\StartMenuInternet\AlalamyBrowser"
  WriteRegStr HKCU "${SMI}" "" "${APPNAME}"
  WriteRegStr HKCU "${SMI}\DefaultIcon" "" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "${SMI}\shell\open\command" "" '"$INSTDIR\${EXENAME}"'
  WriteRegStr HKCU "${SMI}\Capabilities" "ApplicationName" "${APPNAME}"
  WriteRegStr HKCU "${SMI}\Capabilities" "ApplicationIcon" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "${SMI}\Capabilities" "ApplicationDescription" "متصفح بحسابات متعددة معزولة"
  WriteRegStr HKCU "${SMI}\Capabilities\StartMenu" "StartMenuInternet" "AlalamyBrowser"
  WriteRegStr HKCU "${SMI}\Capabilities\URLAssociations" "http" "AlalamyBrowserURL"
  WriteRegStr HKCU "${SMI}\Capabilities\URLAssociations" "https" "AlalamyBrowserURL"
  WriteRegStr HKCU "${SMI}\Capabilities\FileAssociations" ".htm" "AlalamyBrowserHTML"
  WriteRegStr HKCU "${SMI}\Capabilities\FileAssociations" ".html" "AlalamyBrowserHTML"
  WriteRegStr HKCU "Software\RegisteredApplications" "AlalamyBrowser" "${SMI}\Capabilities"
  WriteRegStr HKCU "Software\Classes\AlalamyBrowserURL" "" "رابط ويب"
  WriteRegStr HKCU "Software\Classes\AlalamyBrowserURL" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\AlalamyBrowserURL\DefaultIcon" "" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "Software\Classes\AlalamyBrowserURL\shell\open\command" "" '"$INSTDIR\${EXENAME}" -- "%1"'
  WriteRegStr HKCU "Software\Classes\AlalamyBrowserHTML" "" "صفحة ويب"
  WriteRegStr HKCU "Software\Classes\AlalamyBrowserHTML\DefaultIcon" "" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "Software\Classes\AlalamyBrowserHTML\shell\open\command" "" '"$INSTDIR\${EXENAME}" -- "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  ; تحديث تلقائي من جوه المتصفح (/S /RELAUNCH): يتثبت في صمت ويفتح المتصفح تاني
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/RELAUNCH" $R1
  IfErrors done_relaunch
  Exec '"$INSTDIR\${EXENAME}" --after-update'
  done_relaunch:
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM ${EXENAME}'
  Sleep 500
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  IfFileExists "$INSTDIR\${EXENAME}" 0 +2
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${REGKEY}"
  DeleteRegKey HKCU "Software\AlalamyBrowser"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\AlalamyBrowser"
  DeleteRegValue HKCU "Software\RegisteredApplications" "AlalamyBrowser"
  DeleteRegKey HKCU "Software\Classes\AlalamyBrowserURL"
  DeleteRegKey HKCU "Software\Classes\AlalamyBrowserHTML"
  ; بيانات الحسابات وكلمات المرور تبقى في %APPDATA%\alalamy-browser
SectionEnd
