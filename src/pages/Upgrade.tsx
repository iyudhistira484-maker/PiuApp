import { useEffect, useRef, useState } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { mergePlans } from "../../shared/credits.mjs";
import { Logo } from "../components/ui";
import { api } from "../services/api";
import { useStore } from "../lib/store";
import {
  PLAN_DAYS,
  count,
  costLine,
  expiryLine,
  lastsLabel,
  offerExpiry,
  planBenefits,
  planFacts,
  planOffers,
  periodLeft,
  paymentsNotice,
  rupiah,
  topupOffers,
  usageProfile,
  usageRows,
  type Offer,
} from "../lib/dashboard/plans";
import "../components/services/services.css";
import "../components/services/upgrade.css";

/**
 * Halaman paket. Semua harga dan kredit yang ditampilkan berasal dari
 * `GET /api/account` (produk yang benar-benar dijual server), sehingga perubahan
 * harga dari panel admin langsung terdengar di sini tanpa ubah kode.
 *
 * Alur pembeli dari halaman harga:
 * - Saat provider pembayaran sudah tersambung, klik "Saya tertarik dengan Pro"
 *   atau "Daftar minat Team" di beranda mengarahkan calon pembeli daftar/masuk
 *   dulu, lalu langsung ke /upgrade?plan=pro (atau ?plan=team). Paket yang
 *   dipilih ditandai dan di-scroll ke kartunya saat halaman ini dimuat.
 * - Saat pembayaran belum dikonfigurasi, tombol checkout tetap mati dan halaman
 *   jujur mengatakannya, instead of menjanjikan sesuatu yang tidak ada.
 */
export default function Upgrade() {
  const user = useStore((s) => s.user);
  const signedIn = Boolean(user && !user.demo);
  const { search } = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState("");

  // Paket yang calon pembeli bawa dari halaman harga (pro / team). Diabaikan
  // bila bukan salah satu nama paket yang diketahui ladder.
  const pickedPlan = /^(pro|team)$/i.test(
    new URLSearchParams(search).get("plan") || "",
  )
    ? (new URLSearchParams(search).get("plan") as string).toLowerCase()
    : null;
  const cardRefs = useRef<Record<string, HTMLDivElement>>({});

  const load = async () => {
    const account = await api("/account");
    setData(account);
  };

  useEffect(() => {
    let alive = true;
    setError("");
    if (!signedIn) return;
    setBusy(true);
    load()
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Gagal dimuat.");
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [user?.id, signedIn]);

  // Kartur paket yang dipilih dari beranda: ditandai dan di-scroll saat data
  // harga baru selesai dimuat dari server.
  useEffect(() => {
    if (!data || !pickedPlan) return;
    const el = cardRefs.current[pickedPlan];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("plan-card-picked");
    }
  }, [data, pickedPlan]);

  const checkout = async (sku: string) => {
    setPending(sku);
    setError("");
    try {
      const d = await api("/checkout", { sku });
      if (!d.url?.startsWith("https://"))
        throw new Error(
          "Provider tidak mengembalikan tautan pembayaran yang aman.",
        );
      location.assign(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout gagal dimulai.");
      setPending("");
    }
  };

  const rowText = (offer: Offer, id: string) =>
    offer.durations.find((entry) => entry.id === id)?.text || "—";
  const light = (offer: Offer) => rowText(offer, "ringan");
  const normal = (offer: Offer) => rowText(offer, "normal");
  const intens = (offer: Offer) => rowText(offer, "intens");

  const currentPlan = data?.plan?.plan || "Free";
  const plans = planOffers(data?.products, currentPlan);
  const topups = topupOffers(data?.products);
  const benefits = planBenefits(
    mergePlans(
      Object.fromEntries(
        plans.map((offer) => [
          offer.plan.toLowerCase(),
          { amount: offer.price, credits: offer.credits },
        ]),
      ),
    ),
  );
  const notice = paymentsNotice(data?.paymentsEnabled, data?.provider);
  const left = periodLeft(data?.plan?.current_period_end);
  const balance = Number(data?.balance);
  const balanceKnown = Number.isFinite(balance);
  const usage = usageRows();

  const card = (offer: Offer, kind: "plan" | "topup") => (
    <div
      ref={(el) => {
        if (el && offer.plan) cardRefs.current[offer.plan.toLowerCase()] = el;
      }}
      id={"plan-card-" + offer.sku}
      data-plan={offer.plan.toLowerCase()}
      className={
        "plan-card" +
        (offer.current ? " plan-card-current" : "") +
        (offer.plan.toLowerCase() === pickedPlan ? " plan-card-picked" : "")
      }
      key={offer.sku}
    >
      {offer.current && <span className="plan-flag">Paket Anda sekarang</span>}
      <h3>{offer.plan || offer.label}</h3>
      {offer.plan && offer.label !== offer.plan && (
        <small className="plan-sub">{offer.label}</small>
      )}
      <strong className="plan-price">
        {rupiah(offer.price)}
        <small className="plan-rate"> · {rupiah(offer.rate)}/kredit</small>
      </strong>
      <p className="plan-credits">
        <b>{count(offer.credits)}</b>
        {kind === "plan" ? " kredit per bulan" : " kredit"}
        {kind === "plan"
          ? ` · masa paket ${PLAN_DAYS} hari · ${count(offer.daily)} kredit/hari`
          : " · tanpa masa aktif"}
      </p>
      <p className="plan-meta">
        {kind === "plan"
          ? `Pada pemakaian normal jatah ini bertahan ${normal(offer)}, pada pemakaian intens ${intens(offer)}.`
          : `Menambah ${light(offer)} pemakaian ringan atau ${normal(offer)} pemakaian normal ke saldo berjalan; pada pola intens jatah ini ${intens(offer)}.`}{" "}
        {offerExpiry(offer)}
      </p>
      {kind === "plan" && (
        <ul className="plan-benefits">
          {(
            benefits.find((entry) => entry.plan === offer.plan)?.items || []
          ).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <button
        className="button button-dark"
        disabled={!notice.ready || busy || Boolean(pending)}
        aria-label={
          (kind === "plan" ? "Berlangganan " : "Beli top-up ") + offer.label
        }
        onClick={() => void checkout(offer.sku)}
      >
        {pending === offer.sku
          ? "Membuka checkout…"
          : kind === "plan" && offer.current
            ? "Perpanjang paket"
            : "Checkout"}
      </button>
    </div>
  );

  return (
    <main className="service-page upgrade-page">
      <header>
        <Logo />
        <nav>
          <Link to="/projects">Project</Link>
          <Link to="/account">Akun &amp; kredit</Link>
          <Link to="/marketplace">Marketplace</Link>
        </nav>
      </header>
      <span className="eyebrow-label">PIWUAPP / PAKET</span>
      <h1>Naikkan paket saat karya menuntut lebih.</h1>
      <p className="upgrade-lead">
        Semua paket di halaman ini prabayar {PLAN_DAYS} hari. Tidak ada
        penagihan berulang dan tidak ada penguncian fitur yang disembunyikan.{" "}
        {expiryLine(data?.credits)}
      </p>
      <p className="upgrade-final">
        Pembelian paket dan top-up bersifat final; PiwuApp tidak menyediakan
        refund.
      </p>

      {!signedIn && (
        <section className="service-panel">
          <div className="service-error" role="alert">
            Halaman paket membutuhkan sesi terverifikasi. Masuk lebih dulu agar
            pembelian dan kredit tercatat pada akun Anda — bukan pada peramban
            ini.
            <div className="service-actions">
              <Link to={"/login?next=" + encodeURIComponent("/upgrade")}>
                Masuk ke akun cloud
              </Link>
            </div>
          </div>
        </section>
      )}

      {signedIn && (
        <section className="service-panel" aria-busy={busy}>
          {busy && <p role="status">Memuat paket…</p>}
          {error && (
            <div className="service-error" role="alert">
              {error}
              <div className="service-actions">
                <button
                  onClick={() => {
                    setBusy(true);
                    void load()
                      .catch((e) =>
                        setError(
                          e instanceof Error ? e.message : "Gagal dimulai.",
                        ),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  Coba lagi
                </button>
                <Link to="/account">Buka Akun &amp; kredit</Link>
              </div>
            </div>
          )}

          <div className="plan-status">
            <div>
              <span>Paket aktif</span>
              <strong>{data ? currentPlan : "…"}</strong>
              <small>
                {left ||
                  (data
                    ? "Tanpa masa aktif berbayar"
                    : "Menunggu jawaban server")}
              </small>
            </div>
            <div>
              <span>Kredit tersedia</span>
              <strong>{data ? count(data.balance) : "…"}</strong>
              <small>
                {balanceKnown
                  ? `${lastsLabel(balance, usageProfile("normal"))} pada pemakaian normal`
                  : "Terpakai per operasi, tercatat di ledger"}
              </small>
            </div>
            <div className="plan-status-actions">
              <Link to="/account">Riwayat &amp; pesanan</Link>
              <Link to="/projects">Kembali ke dashboard</Link>
            </div>
          </div>

          {!data && !busy && !error && (
            <p className="plan-meta">
              Paket belum bisa dimuat, jadi daftar harga tidak ditampilkan.
              Harga yang tidak terbaca tidak diganti dengan angka perkiraan.
            </p>
          )}

          {data && (
            <>
              <p
                className={
                  "plan-notice" + (notice.ready ? "" : " plan-notice-warn")
                }
              >
                {notice.text}
              </p>

              {pickedPlan &&
                plans.some((o) => o.plan.toLowerCase() === pickedPlan) && (
                  <div className="plan-picked-banner" role="status">
                    Paket yang Anda pilih:{" "}
                    <b>{pickedPlan === "pro" ? "Pro" : "Team"}</b> · lanjut ke
                    tombol checkout pada kartu paket di bawah.
                  </div>
                )}

              <h2>Paket</h2>
              {plans.length ? (
                <>
                  <nav className="plan-picker" aria-label="Pilih paket">
                    <span className="plan-picker-label">
                      Pilih paket yang Anda beli
                    </span>
                    {plans.map((offer) => {
                      const isCurrent = offer.current;
                      const isPicked = offer.plan.toLowerCase() === pickedPlan;
                      return (
                        <button
                          key={offer.sku}
                          type="button"
                          className={
                            "plan-picker-button" +
                            (isPicked ? " plan-picker-button-picked" : "") +
                            (isCurrent ? " plan-picker-button-current" : "")
                          }
                          aria-pressed={isPicked || isCurrent}
                          onClick={() => {
                            const el =
                              cardRefs.current[offer.plan.toLowerCase()];
                            if (el)
                              el.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          }}
                        >
                          {offer.plan}
                          <span className="plan-picker-price">
                            {rupiah(offer.price)} / bulan
                          </span>
                          {isCurrent && (
                            <span className="plan-picker-now">
                              Paket Anda sekarang
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                  <div className="plan-grid">
                    {plans.map((offer) => card(offer, "plan"))}
                  </div>
                </>
              ) : (
                <p className="plan-meta">
                  Server tidak melaporkan satu pun produk paket. Tidak ada
                  penawaran yang ditampilkan karena tidak ada yang bisa dibeli.
                </p>
              )}

              <h2>Top-up kredit</h2>
              {topups.length ? (
                <div className="plan-grid">
                  {topups.map((offer) => card(offer, "topup"))}
                </div>
              ) : (
                <p className="plan-meta">
                  Server tidak melaporkan produk top-up. Kredit dapat ditambah
                  lewat paket di atas bila tersedia.
                </p>
              )}

              <h2>Seberapa lama kredit bertahan</h2>
              <p className="plan-meta">
                {expiryLine(data?.credits)} Tabel ini menjawab pertanyaan yang
                berbeda — berapa lama sebuah jatah terpakai habis pada tiga pola
                pemakaian. Angkanya aritmetika dari harga per operasi (
                {costLine()}), bukan janji; pemakaian Anda bisa lebih hemat atau
                lebih boros.
              </p>
              <div
                className="plan-table"
                role="table"
                aria-label="Perkiraan durasi kredit per pola pemakaian"
              >
                <div className="plan-table-row plan-table-head" role="row">
                  <span role="columnheader">Pola pemakaian</span>
                  <span role="columnheader">Kredit/hari</span>
                  {balanceKnown && <span role="columnheader">Saldo Anda</span>}
                  {plans.map((offer) => (
                    <span role="columnheader" key={offer.sku}>
                      {offer.plan}
                    </span>
                  ))}
                </div>
                {usage.map((row, index) => (
                  <div className="plan-table-row" role="row" key={row.id}>
                    <span role="cell">
                      <b>{row.label}</b>
                      <small>{row.detail}</small>
                    </span>
                    <span role="cell">{row.perDay}</span>
                    {balanceKnown && (
                      <span role="cell">
                        {lastsLabel(balance, usageProfile(row.id))}
                      </span>
                    )}
                    {plans.map((offer) => (
                      <span role="cell" key={offer.sku}>
                        {offer.durations[index]?.text || "—"}
                      </span>
                    ))}
                  </div>
                ))}
              </div>

              {!!data.orders?.length && (
                <>
                  <h2>Pesanan terakhir</h2>
                  {data.orders.slice(0, 5).map((o: any) => (
                    <div className="service-row" key={o.id}>
                      <span>
                        {o.sku} · {rupiah(o.amount)}
                        <small>
                          {o.status} ·{" "}
                          {new Date(o.created_at).toLocaleString("id-ID")}
                        </small>
                      </span>
                      {o.checkout_url &&
                        ["pending", "created"].includes(o.status) && (
                          <a href={o.checkout_url}>Lanjutkan pembayaran ↗</a>
                        )}
                    </div>
                  ))}
                </>
              )}

              <section className="plan-faq">
                <h2>Pertanyaan yang sering ditanya</h2>
                <article>
                  <h3>Apa yang terjadi setelah saya checkout?</h3>
                  <p>
                    Anda dibawa ke halaman penyedia pembayaran yang terhubung di
                    server ini. Setelah pembayaran diverifikasi, paket aktif
                    selama 30 hari dan kredit paket masuk ke saldo akun Anda.
                    Pesanan yang masih menunggu bisa dilanjutkan di halaman Akun
                    &amp; kredit.
                  </p>
                </article>
                <article>
                  <h3>Apakah paket diperpanjang otomatis?</h3>
                  <p>
                    Tidak. Semua paket prabayar 30 hari — tidak ada penagihan
                    berulang dan tidak ada penambalan otomatis ke kartu. Beli
                    lagi kapan Anda butuh kredit lebih banyak.
                  </p>
                </article>
                <article>
                  <h3>Bisakah saya mendapatkan pengembalian dana?</h3>
                  <p>
                    Pembelian paket dan top-up bersifat final; PiwuApp tidak
                    menyediakan refund. Pastikan paket yang dipilih sudah cocok
                    sebelum checkout.
                  </p>
                </article>
                <article>
                  <h3>Apakah fitur diblokir jika saya tidak naik paket?</h3>
                  <p>
                    Tidak. Semua paket pakai builder, template, editor, preview,
                    dan Export ZIP yang sama. Yang berbeda adalah jumlah kredit
                    dan jatah harian, bukan akses ke fitur.
                  </p>
                </article>
              </section>

              <h2>Yang berlaku hari ini</h2>
              <div className="plan-facts">
                {planFacts().map((fact) => (
                  <div className="plan-fact" key={fact.title}>
                    <b>{fact.title}</b>
                    <p>{fact.detail}</p>
                  </div>
                ))}
              </div>
              <p className="plan-meta">
                Butuh faktur atau pembayaran nominal lain? Halaman ini hanya
                memakai produk yang dilaporkan server; tidak ada SKU
                tersembunyi.
              </p>
              <div className="service-actions">
                <button
                  onClick={() =>
                    navigate(signedIn ? "/projects" : "/login?next=/upgrade")
                  }
                >
                  {signedIn ? "Kembali ke dashboard" : "Masuk untuk membeli"}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
