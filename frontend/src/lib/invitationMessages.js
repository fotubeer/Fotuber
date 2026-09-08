// 30 hazır davetiye metni — etkinlik türüne göre gruplu. Oluşturan seçebilir ya da manuel yazar.
export const INVITATION_MESSAGES = {
  dugun: [
    "Hayatımızın en özel gününde, mutluluğumuza ortak olmanızdan onur duyarız.",
    "İki yüreğin bir olduğu bu güzel günde sizleri de aramızda görmek isteriz.",
    "Sevgiyle başlayan yolculuğumuzu evlilikle taçlandırıyoruz; siz de yanımızda olun.",
    "Bir ömür boyu sürecek mutluluğumuzun başladığı güne sizleri bekliyoruz.",
    "Aşkımızı nikâh masasına taşıyoruz; bu anlamlı günde bizimle olmanızı dileriz.",
    "Mutluluğumuzu sizlerle paylaşmak, bu güzel günü daha da değerli kılacak.",
  ],
  nisan: [
    "Birlikteliğimizin ilk adımını atıyoruz; nişan sevincimize ortak olun.",
    "Sözümüzü verdiğimiz bu güzel günde sizleri de aramızda görmek isteriz.",
    "İki ailenin mutlulukla birleştiği nişan törenimize davetlisiniz.",
    "Kalplerimizi birleştirdiğimiz bu özel günde yanımızda olmanızı dileriz.",
    "Sevgimizi nişanla mühürlüyoruz; bu mutlu anı bizimle paylaşın.",
  ],
  kina: [
    "Geleneklerimizle bezenmiş kına gecemizde sizleri de aramızda görmek isteriz.",
    "Kınamızı yakıyor, mutluluğumuzu sizlerle paylaşmak istiyoruz.",
    "Eğlence, müzik ve gelenekle dolu kına gecemize davetlisiniz.",
    "Bu anlamlı gecede kınamıza renk katmanızı dileriz.",
  ],
  sunnet: [
    "Yavuklumuzun/oğlumuzun sünnet şöleninde sizleri de aramızda görmek isteriz.",
    "Mutluluğumuza ortak olmanız için sünnet düğünümüze davetlisiniz.",
    "Erkekliğe ilk adımı attığımız bu güzel günde yanımızda olun.",
    "Neşe dolu sünnet şölenimizde buluşmak dileğiyle.",
  ],
  dogumgunu: [
    "Bir yaş daha büyümenin coşkusunu sizlerle kutlamak istiyoruz!",
    "Doğum günü partimize renk katmanız için sizi bekliyoruz.",
    "Pasta, müzik ve eğlence dolu bu özel günde yanımızda olun.",
    "Mutlu bir yaş gününü birlikte kutlamak dileğiyle sizi bekliyoruz.",
    "Yeni yaşımıza hep birlikte 'İyi ki doğdun' demek için buradayız!",
  ],
  nikah: [
    "Resmî nikâh törenimizde şahidimiz olmanızı diler, sizleri aramızda görmek isteriz.",
    "İki 'evet' ile başlayan hayatımızın nikâh anına davetlisiniz.",
    "Nikâh masasında el ele tutuşacağımız o özel anda yanımızda olun.",
  ],
  diger: [
    "Bu özel günümüzde sizleri de aramızda görmekten mutluluk duyarız.",
    "Anlamlı etkinliğimize katılımınız bizi onurlandıracaktır.",
    "Güzel bir günü birlikte geçirmek dileğiyle sizleri bekliyoruz.",
  ],
};

export const getMessagesFor = (eventType) => INVITATION_MESSAGES[eventType] || INVITATION_MESSAGES.diger;
