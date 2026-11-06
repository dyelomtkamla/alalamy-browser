import SwiftUI
import AVFoundation
import MediaPlayer
import QuickLookThumbnailing

// MARK: - السجل (زي كروم: بحث، تقسيم حسب اليوم، مسح)

struct HistoryItem: Codable, Identifiable, Hashable {
    var id = UUID()
    var url: String
    var title: String
    var date: Date
}

@MainActor
final class HistoryStore: ObservableObject {
    static let shared = HistoryStore()
    @Published private(set) var items: [HistoryItem] = []
    private let key = "history.v1"

    init() {
        if let d = UserDefaults.standard.data(forKey: key), let l = try? JSONDecoder().decode([HistoryItem].self, from: d) { items = l }
    }

    func add(url: URL?, title: String) {
        guard let url, let s = url.scheme, s.hasPrefix("http") else { return }
        let u = url.absoluteString
        items.removeAll { $0.url == u }
        items.insert(HistoryItem(url: u, title: title.isEmpty ? (url.host ?? u) : title, date: Date()), at: 0)
        if items.count > 1000 { items.removeLast(items.count - 1000) }
        save()
    }

    func remove(_ ids: Set<UUID>) { items.removeAll { ids.contains($0.id) }; save() }
    func clear() { items = []; save() }
    private func save() { if let d = try? JSONEncoder().encode(items) { UserDefaults.standard.set(d, forKey: key) } }
}

struct HistoryView: View {
    @ObservedObject var store = HistoryStore.shared
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var confirmClear = false
    let open: (URL) -> Void

    private var groups: [(String, [HistoryItem])] {
        let q = query.lowercased()
        let list = q.isEmpty ? store.items : store.items.filter { $0.url.lowercased().contains(q) || $0.title.lowercased().contains(q) }
        let f = DateFormatter(); f.locale = Locale(identifier: "ar_EG"); f.dateFormat = "EEEE، d MMMM yyyy"
        var out: [(String, [HistoryItem])] = []
        for it in list {
            var label = f.string(from: it.date)
            if Calendar.current.isDateInToday(it.date) { label = "اليوم - " + label }
            else if Calendar.current.isDateInYesterday(it.date) { label = "أمس - " + label }
            if let i = out.firstIndex(where: { $0.0 == label }) { out[i].1.append(it) } else { out.append((label, [it])) }
        }
        return out
    }

    var body: some View {
        NavigationStack {
            List {
                if store.items.isEmpty { Text("السجل فاضي").foregroundStyle(.secondary) }
                ForEach(groups, id: \.0) { g in
                    Section(g.0) {
                        ForEach(g.1) { it in
                            Button {
                                if let u = URL(string: it.url) { open(u); dismiss() }
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(it.title).lineLimit(1).foregroundStyle(.primary)
                                    Text((URL(string: it.url)?.host ?? it.url) + " · " + it.date.formatted(date: .omitted, time: .shortened))
                                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                            }
                        }
                        .onDelete { idx in store.remove(Set(idx.map { g.1[$0].id })) }
                    }
                }
            }
            .searchable(text: $query, prompt: "بحث في السجل")
            .navigationTitle("السجل")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark") } }
                ToolbarItem(placement: .destructiveAction) { Button("مسح الكل", role: .destructive) { confirmClear = true }.disabled(store.items.isEmpty) }
            }
            .confirmationDialog("مسح السجل كله؟", isPresented: $confirmClear) {
                Button("مسح", role: .destructive) { store.clear() }
            }
        }
    }
}

// MARK: - المنصات (منصات جاهزة + منصات بتضيفها باسمها ورابطها). كل دوسة بتفتح نافذة جديدة على نفس الحساب

struct Platform: Codable, Identifiable, Hashable {
    var id = UUID()
    var name: String
    var url: String
}

@MainActor
final class PlatformStore: ObservableObject {
    static let shared = PlatformStore()
    @Published var custom: [Platform] = [] { didSet { save() } }
    private let key = "platforms.v1"
    static let builtIn: [Platform] = [
        Platform(name: "فيسبوك", url: "https://m.facebook.com/"), Platform(name: "انستجرام", url: "https://www.instagram.com/"),
        Platform(name: "تيك توك", url: "https://www.tiktok.com/"), Platform(name: "سناب شات إعلانات", url: "https://ads.snapchat.com/"),
        Platform(name: "جوجل ادز", url: "https://ads.google.com/"), Platform(name: "ميتا بيزنس", url: "https://business.facebook.com/"),
        Platform(name: "إكس (تويتر)", url: "https://x.com/"), Platform(name: "يوتيوب", url: "https://m.youtube.com/")
    ]

    init() {
        if let d = UserDefaults.standard.data(forKey: key), let l = try? JSONDecoder().decode([Platform].self, from: d) { custom = l }
    }
    private func save() { if let d = try? JSONEncoder().encode(custom) { UserDefaults.standard.set(d, forKey: key) } }
}

struct AddPlatformView: View {
    @ObservedObject var store = PlatformStore.shared
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var url = ""
    var body: some View {
        NavigationStack {
            Form {
                TextField("اسم المنصة، مثلاً: تيك توك إعلانات", text: $name)
                TextField("https://ads.tiktok.com/", text: $url).textInputAutocapitalization(.never).keyboardType(.URL).autocorrectionDisabled()
                Text("المنصة هتظهر في قايمة «المنصات»، وكل دوسة عليها بتفتحها في نافذة جديدة على نفس الحساب.").font(.footnote).foregroundStyle(.secondary)
                if !store.custom.isEmpty {
                    Section("منصاتك") {
                        ForEach(store.custom) { p in VStack(alignment: .leading) { Text(p.name); Text(p.url).font(.caption).foregroundStyle(.secondary) } }
                            .onDelete { store.custom.remove(atOffsets: $0) }
                    }
                }
            }
            .navigationTitle("إضافة منصة")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark") } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("إضافة") {
                        var s = url.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !s.lowercased().hasPrefix("http") { s = "https://" + s }
                        guard let u = URL(string: s), let h = u.host, h.contains(".") else { return }
                        let n = name.trimmingCharacters(in: .whitespaces)
                        store.custom.append(Platform(name: n.isEmpty ? h : String(n.prefix(40)), url: u.absoluteString))
                        dismiss()
                    }.disabled(url.isEmpty)
                }
            }
        }
    }
}

// MARK: - تنزيلاتي بصور مصغرة

struct DownloadFile: Identifiable, Hashable {
    let url: URL
    let size: Int64
    let date: Date
    var id: URL { url }
}

struct ThumbView: View {
    let url: URL
    @State private var image: UIImage?
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8).fill(Color(.systemGray4))
            if let image { Image(uiImage: image).resizable().scaledToFill() }
            else { Image(systemName: isAudio ? "music.note" : "film").font(.title2).foregroundStyle(.white) }
            if image != nil && !isAudio { Image(systemName: "play.fill").foregroundStyle(.white).shadow(radius: 3) }
        }
        .frame(width: 96, height: 54).clipShape(RoundedRectangle(cornerRadius: 8))
        .task {
            let req = QLThumbnailGenerator.Request(fileAt: url, size: CGSize(width: 192, height: 108), scale: UIScreen.main.scale, representationTypes: .thumbnail)
            if let r = try? await QLThumbnailGenerator.shared.generateBestRepresentation(for: req) { image = r.uiImage }
        }
    }
    private var isAudio: Bool { ["mp3", "m4a", "aac", "wav", "ogg"].contains(url.pathExtension.lowercased()) }
}

struct DownloadsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var files: [DownloadFile] = []
    @State private var share: URL?
    var body: some View {
        NavigationStack {
            List {
                if files.isEmpty { Text("لسه مفيش تنزيلات").foregroundStyle(.secondary) }
                ForEach(files) { f in
                    HStack(spacing: 12) {
                        ThumbView(url: f.url)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(f.url.lastPathComponent).lineLimit(2)
                            Text(ByteCountFormatter.string(fromByteCount: f.size, countStyle: .file) + " · " + f.date.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { share = f.url }
                }
                .onDelete { idx in
                    for i in idx { try? FileManager.default.removeItem(at: files[i].url) }
                    reload()
                }
            }
            .navigationTitle("تنزيلاتي")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark") } } }
            .onAppear(perform: reload)
            .sheet(item: $share) { u in ShareSheet(items: [u]) }
        }
    }
    private func reload() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
        let list = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles])) ?? []
        files = list.compactMap { u in
            guard let v = try? u.resourceValues(forKeys: Set(keys)), v.isRegularFile == true else { return nil }
            return DownloadFile(url: u, size: Int64(v.fileSize ?? 0), date: v.contentModificationDate ?? Date())
        }.sorted { $0.date > $1.date }
    }
}

extension URL: @retroactive Identifiable { public var id: String { absoluteString } }

// MARK: - مشغّل القرآن MP3 (كل القرّاء من mp3quran.net)

struct QReciter: Identifiable, Hashable { let id: Int; let name: String; let moshaf: [QMoshaf] }
struct QMoshaf: Hashable { let name: String; let server: String; let list: [Int] }

private struct QAPI: Decodable {
    struct R: Decodable { let id: Int; let name: String; let moshaf: [M] }
    struct M: Decodable { let name: String; let server: String; let surah_list: String }
    let reciters: [R]
}

@MainActor
final class QuranPlayer: ObservableObject {
    static let shared = QuranPlayer()
    static let surahs = ["الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس", "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", "الكهف", "مريم", "طه", "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم", "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر", "غافر", "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق", "الذاريات", "الطور", "النجم", "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة", "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", "المعارج", "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس", "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد", "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات", "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر", "المسد", "الإخلاص", "الفلق", "الناس"]

    @Published var reciters: [QReciter] = []
    @Published var reciter: QReciter?
    @Published var moshaf = 0
    @Published var surah = 0
    @Published var playing = false
    @Published var offline = false
    @Published var repeatMode = "all" // all | one | off
    @Published var time: Double = 0
    @Published var duration: Double = 0
    private var player: AVPlayer?
    private var timeObs: Any?
    private var endObs: NSObjectProtocol?
    private var commandsReady = false

    var current: QMoshaf? { guard let r = reciter, !r.moshaf.isEmpty else { return nil }; return r.moshaf[min(moshaf, r.moshaf.count - 1)] }
    func surahList(_ m: QMoshaf?) -> [Int] { if let m, !m.list.isEmpty { return m.list }; return Array(1...114) }

    func load() async {
        if !reciters.isEmpty { return }
        let cacheURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("quran-reciters.json")
        var data: Data?
        if let attrs = try? FileManager.default.attributesOfItem(atPath: cacheURL.path), let d = attrs[.modificationDate] as? Date,
           Date().timeIntervalSince(d) < 7 * 86400 { data = try? Data(contentsOf: cacheURL) }
        if data == nil, let u = URL(string: "https://mp3quran.net/api/v3/reciters?language=ar") {
            if let (d, _) = try? await URLSession.shared.data(from: u) { data = d; try? d.write(to: cacheURL) }
        }
        if data == nil { data = try? Data(contentsOf: cacheURL); offline = true }
        if let data, let api = try? JSONDecoder().decode(QAPI.self, from: data) {
            reciters = api.reciters.compactMap { r in
                let ms = r.moshaf.filter { $0.server.hasPrefix("https://") }.map { m in
                    QMoshaf(name: m.name, server: m.server.hasSuffix("/") ? m.server : m.server + "/", list: m.surah_list.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }.filter { (1...114).contains($0) })
                }
                return ms.isEmpty ? nil : QReciter(id: r.id, name: r.name.trimmingCharacters(in: .whitespaces), moshaf: ms)
            }.sorted { $0.name.compare($1.name, locale: Locale(identifier: "ar")) == .orderedAscending }
        }
        if reciters.isEmpty {
            offline = true
            let f: [(String, String)] = [("مشاري العفاسي", "https://server8.mp3quran.net/afs/"), ("عبدالباسط عبدالصمد", "https://server7.mp3quran.net/basit/"),
                                         ("محمد صديق المنشاوي", "https://server10.mp3quran.net/minsh/"), ("محمود خليل الحصري", "https://server13.mp3quran.net/husr/"),
                                         ("عبدالرحمن السديس", "https://server11.mp3quran.net/sds/"), ("ماهر المعيقلي", "https://server12.mp3quran.net/maher/")]
            reciters = f.enumerated().map { QReciter(id: -($0.offset + 1), name: $0.element.0, moshaf: [QMoshaf(name: "حفص عن عاصم - مرتل", server: $0.element.1, list: [])]) }
        }
        let saved = UserDefaults.standard.integer(forKey: "quran.reciter")
        if reciter == nil, let r = reciters.first(where: { $0.id == saved }) {
            reciter = r; moshaf = UserDefaults.standard.integer(forKey: "quran.moshaf"); surah = UserDefaults.standard.integer(forKey: "quran.surah")
        }
    }

    func play(_ n: Int) {
        guard let m = current, let r = reciter, let u = URL(string: m.server + String(format: "%03d", n) + ".mp3") else { return }
        surah = n
        UserDefaults.standard.set(r.id, forKey: "quran.reciter"); UserDefaults.standard.set(moshaf, forKey: "quran.moshaf"); UserDefaults.standard.set(n, forKey: "quran.surah")
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        if let o = timeObs, let p = player { p.removeTimeObserver(o) }
        if let e = endObs { NotificationCenter.default.removeObserver(e) }
        let item = AVPlayerItem(url: u)
        let p = AVPlayer(playerItem: item)
        player = p
        timeObs = p.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 2), queue: .main) { [weak self] t in
            Task { @MainActor in
                guard let self else { return }
                self.time = t.seconds
                let d = p.currentItem?.duration.seconds ?? 0
                self.duration = d.isFinite ? d : 0
                self.updateNowPlaying()
            }
        }
        endObs = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.finished() }
        }
        p.play()
        playing = true
        setupCommands()
        updateNowPlaying()
    }

    private func finished() {
        if repeatMode == "one" { player?.seek(to: .zero); player?.play() } else { next(1) }
    }

    func next(_ dir: Int) {
        let l = surahList(current)
        guard !l.isEmpty else { return }
        var i = (l.firstIndex(of: surah) ?? -1) + dir
        if i >= l.count { if repeatMode != "all" { playing = false; return }; i = 0 }
        if i < 0 { i = l.count - 1 }
        play(l[i])
    }

    func toggle() {
        guard let p = player else { if surah > 0 { play(surah) } else if let f = surahList(current).first { play(f) }; return }
        if playing { p.pause() } else { p.play() }
        playing.toggle()
        updateNowPlaying()
    }

    func seek(_ t: Double) { player?.seek(to: CMTime(seconds: t, preferredTimescale: 600)) }

    func stop() { player?.pause(); player = nil; playing = false }

    private func setupCommands() {
        guard !commandsReady else { return }
        commandsReady = true
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in Task { @MainActor in if self?.playing == false { self?.toggle() } }; return .success }
        c.pauseCommand.addTarget { [weak self] _ in Task { @MainActor in if self?.playing == true { self?.toggle() } }; return .success }
        c.nextTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.next(1) }; return .success }
        c.previousTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.next(-1) }; return .success }
    }

    private func updateNowPlaying() {
        guard surah > 0 else { return }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: "سورة " + QuranPlayer.surahs[surah - 1],
            MPMediaItemPropertyArtist: reciter?.name ?? "",
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: time,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0
        ]
    }
}

struct QuranView: View {
    @ObservedObject var q = QuranPlayer.shared
    @Environment(\.dismiss) private var dismiss
    @State private var tab = 0
    @State private var search = ""

    private func norm(_ s: String) -> String {
        s.replacingOccurrences(of: "أ", with: "ا").replacingOccurrences(of: "إ", with: "ا").replacingOccurrences(of: "آ", with: "ا")
            .replacingOccurrences(of: "ة", with: "ه").replacingOccurrences(of: "ى", with: "ي").lowercased()
    }
    private func fmt(_ t: Double) -> String { let s = Int(max(0, t.isFinite ? t : 0)); return String(format: "%d:%02d", s / 60, s % 60) }

    var body: some View {
        NavigationStack {
            VStack(spacing: 10) {
                VStack(spacing: 6) {
                    Text(q.surah > 0 ? "سورة " + QuranPlayer.surahs[q.surah - 1] : (q.reciter == nil ? "اختار القارئ" : "اختار سورة")).font(.title2.bold())
                    Text(q.reciter.map { $0.name + (q.current.map { " · " + $0.name } ?? "") } ?? "كل القرّاء من mp3quran.net").font(.footnote).opacity(0.85)
                    Slider(value: Binding(get: { q.time }, set: { q.seek($0) }), in: 0...max(q.duration, 1)).tint(.white)
                    Text(fmt(q.time) + " / " + fmt(q.duration)).font(.caption).monospacedDigit()
                    HStack(spacing: 28) {
                        Button { q.repeatMode = q.repeatMode == "all" ? "one" : q.repeatMode == "one" ? "off" : "all" } label: {
                            Image(systemName: q.repeatMode == "one" ? "repeat.1" : q.repeatMode == "all" ? "repeat" : "stop.circle")
                        }
                        Button { q.next(-1) } label: { Image(systemName: "backward.end.fill") }
                        Button { q.toggle() } label: { Image(systemName: q.playing ? "pause.circle.fill" : "play.circle.fill").font(.system(size: 48)) }
                        Button { q.next(1) } label: { Image(systemName: "forward.end.fill") }
                    }
                    .font(.title3).disabled(q.reciter == nil)
                    .environment(\.layoutDirection, .leftToRight)
                }
                .foregroundStyle(.white).padding().frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 16).fill(LinearGradient(colors: [Color(red: 0.04, green: 0.43, blue: 0.31), Color(red: 0.07, green: 0.54, blue: 0.44)], startPoint: .topLeading, endPoint: .bottomTrailing)))
                .padding(.horizontal)

                Picker("", selection: $tab) { Text("القرّاء (\(q.reciters.count))").tag(0); Text("السور").tag(1) }.pickerStyle(.segmented).padding(.horizontal)
                if q.current != nil, let r = q.reciter, r.moshaf.count > 1, tab == 1 {
                    Picker("الرواية", selection: $q.moshaf) { ForEach(r.moshaf.indices, id: \.self) { Text(r.moshaf[$0].name).tag($0) } }.padding(.horizontal)
                }
                List {
                    if tab == 0 {
                        if q.reciters.isEmpty { ProgressView("بيجيب قايمة القرّاء...") }
                        if q.offline { Text("النت فاصل: دي آخر قايمة اتحفظت").font(.footnote).foregroundStyle(.secondary) }
                        ForEach(q.reciters.filter { search.isEmpty || norm($0.name).contains(norm(search)) }) { r in
                            Button {
                                let changed = q.reciter?.id != r.id
                                q.reciter = r
                                if changed { q.moshaf = 0; if q.surah > 0 && q.playing && q.surahList(q.current).contains(q.surah) { q.play(q.surah) } }
                                tab = 1; search = ""
                            } label: {
                                HStack {
                                    Text(r.name).foregroundStyle(.primary)
                                    Spacer()
                                    if r.moshaf.count > 1 { Text("\(r.moshaf.count) روايات").font(.caption).foregroundStyle(.secondary) }
                                    if q.reciter?.id == r.id { Image(systemName: "checkmark").foregroundStyle(.green) }
                                }
                            }
                        }
                    } else {
                        ForEach(q.surahList(q.current).filter { search.isEmpty || norm(QuranPlayer.surahs[$0 - 1]).contains(norm(search)) || String($0) == search }, id: \.self) { n in
                            Button { q.play(n) } label: {
                                HStack {
                                    Text("\(n)").font(.caption.bold()).frame(width: 30, height: 30).background(Circle().fill(Color.green.opacity(0.15)))
                                    Text(QuranPlayer.surahs[n - 1]).foregroundStyle(.primary).fontWeight(n == q.surah ? .bold : .regular)
                                    Spacer()
                                    if n == q.surah && q.playing { Image(systemName: "waveform").foregroundStyle(.green) }
                                }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
            .searchable(text: $search, prompt: tab == 0 ? "ابحث عن قارئ" : "ابحث عن سورة")
            .navigationTitle("القرآن الكريم").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "xmark") } } }
            .task { await q.load(); if q.reciter != nil { tab = 1 } }
        }
    }
}
