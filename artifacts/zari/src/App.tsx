import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArrowRight, ArrowUpRight, Bell, Camera, Check, ChevronRight, Copy, Eye, ImagePlus, LayoutGrid, Link as LinkIcon, Loader2, LockKeyhole, MapPin, MessageCircle, MoreHorizontal, Palette, Pencil, Plus, Save, Search, Send, Settings, ShieldCheck, Shirt, Sparkles, Star, Trash2, Upload, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import NotFound from '@/pages/not-found';
import { ThreadScene } from '@/components/ThreadScene';
import { isApiConfigured } from '@/lib/config';
import { ApiError } from '@/lib/apiClient';
import { session } from '@/lib/session';
import { useAuthActions, useCurrentUser, useDesign, useDesigners, useDesignerProfile, useDesigns, useEditDesign, useGenerateDesign, useGuestBootstrap, useOrders } from '@/hooks/useZari';
import { designsService } from '@/services/designs';
import { mockDesignerProfiles } from '@/data/mock';

const queryClient = new QueryClient();

type ToastState = { message: string } | null;

function Brand({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><span>Z</span></span><span>Zari</span></Link>;
}

/**
 * Shown when a screen is rendering the bundled demo set rather than live data.
 * Passing demo content off as real would break the one promise the product is
 * built on, so this is deliberately visible — just quiet.
 */
function DemoNote({ isLive }: { isLive: boolean }) {
  if (isLive || !isApiConfigured) return null;
  return <span className="demo-note" title="The server is unreachable, so Zari is showing sample content." data-testid="status-demo-data">Sample data</span>;
}

function Button({ children, variant = 'primary', className = '', onClick, type = 'button', testId, disabled = false }: { children: React.ReactNode; variant?: 'primary' | 'ghost' | 'soft' | 'coral'; className?: string; onClick?: () => void; type?: 'button' | 'submit'; testId?: string; disabled?: boolean }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button button-${variant} ${className}`} data-testid={testId}>{children}</button>;
}

function GarmentArt({ tone = 'lavender', url, className = '' }: { tone?: string; url?: string | null; className?: string }) {
  if (url) return <img src={url} alt="Custom garment concept" className={`garment-art garment-photo ${className}`} loading="lazy" />;
  return <div className={`garment-art ${className}`} data-tone={tone} aria-label="Illustrated custom garment visual" role="img" />;
}

function Landing() {
  const { data: designers } = useDesigners();
  return <main className="landing page">
    <div className="container">
      <nav className="landing-nav" aria-label="Main navigation">
        <Brand />
        <div className="landing-links"><a href="#how-it-works">How it works</a><a href="#designers">Designers</a><a href="#promise">Our promise</a></div>
        <div className="landing-actions"><Link href="/login" className="text-link" data-testid="link-login">Sign in</Link><Link href="/app" className="button button-primary button-small" data-testid="link-start-design">Start a design <ArrowRight size={14} /></Link></div>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">A made-to-measure marketplace</div>
          <h1>Ideas worth <em>wearing.</em></h1>
          <p>Zari turns the outfit in your head into a manufacturable design, a legible price, and a real conversation with a verified Indian designer.</p>
          <div className="hero-cta"><Link href="/app" className="button button-primary" data-testid="button-hero-start">Describe your outfit <ArrowRight size={16} /></Link><a href="#how-it-works" className="text-link" data-testid="link-see-process">See how it works <ArrowUpRight size={14} /></a></div>
        </div>
        <div className="hero-art" aria-label="Pastel lavender lehenga editorial visual">
           <ThreadScene className="hero-thread" />
          <div className="hero-card hero-card-main"><GarmentArt /></div><div className="hero-card hero-card-side"><GarmentArt tone="peach" /></div>
          <div className="hero-stamp">Made for<br />your moment<small>Est. 2024 · India</small></div>
          <div className="floating-note"><div className="eyebrow">Your brief</div><strong>Pastel lavender, movement, not too much sparkle</strong><span>Ready to make</span></div>
        </div>
      </section>
    </div>
    <div className="marquee"><div className="marquee-track"><span>From inspiration to stitching</span><span className="dot">·</span><span>Transparent estimates</span><span className="dot">·</span><span>Verified human designers</span><span className="dot">·</span><span>Made in India</span><span className="dot">·</span></div></div>
    <section className="section container" id="how-it-works">
      <div className="section-heading"><div><div className="eyebrow">The Zari way</div><h2>Less guesswork.<br />More <em className="serif">intention.</em></h2></div><p>You bring the feeling. We bring the structure, craft, and people to make it real.</p></div>
      <div className="process-grid"><div className="process-card"><div className="process-number">01 / YOUR IDEA</div><h3>Start with a feeling, not a form.</h3><p className="muted">Describe the colour, occasion, or silhouette. Add an inspiration image when words are not enough.</p></div><div className="process-card"><div className="process-number">02 / YOUR DESIGN</div><h3>Make it manufacturable.</h3><p>See a clear design with fabric, construction notes, complexity, and a realistic estimate.</p></div><div className="process-card"><div className="process-number">03 / YOUR MAKER</div><h3>Meet the right human.</h3><p>Compare verified designers on quality, price, lead time, and the details that matter.</p></div></div>
    </section>
    <section className="section market-section" id="designers">
       <div className="container market-grid"><div className="market-copy"><div className="eyebrow">A calmer marketplace</div><h2>Good work has a name.</h2><p>Zari is not an image generator that leaves you alone. It is a considered bridge to an independent designer who can cut, source, stitch, and stand behind the work.</p><Link href="/marketplace" className="button button-coral" data-testid="button-meet-designers">Meet the designers <ArrowRight size={15} /></Link></div><div className="maker-stack">{designers.slice(0, 3).map((designer) => <Link href={`/designers/${designer.slug}`} className="maker-card" key={designer.id} data-testid={`link-landing-designer-${designer.id}`}><div className="maker-art" data-tone={designer.tone}></div><strong>{designer.name}</strong><div className="maker-meta"><span>{designer.city}</span><span>QS {designer.score}</span></div></Link>)}</div></div>
    </section>
    <section className="section container quote-section" id="promise"><div><div className="quote-mark">“</div><div className="quote">I knew exactly how I wanted to feel. Zari helped me explain the rest.</div><div className="quote-by">— Anika, Hyderabad · Engagement set</div></div><div className="manifesto"><div className="eyebrow">The promise</div><h2>No black boxes between your idea and your invoice.</h2><p>Every estimate has a reason. Every substitution is yours to choose. Every maker is a person you can message before a rupee is committed.</p></div></section>
    <footer className="container footer"><span>© 2024 Zari Atelier Marketplace</span><span>Made slowly. Made in India.</span></footer>
  </main>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const user = useCurrentUser();
  const nav = [{ href: '/app', label: 'Home', icon: LayoutGrid }, { href: '/app/designs', label: 'My designs', icon: Shirt }, { href: '/marketplace', label: 'Designers', icon: UsersRound }, { href: '/orders', label: 'Orders', icon: WalletCards }];
  const displayName = user?.name ?? 'Guest';
  const initials = displayName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'GU';
  return <div className="app-shell"><aside className="sidebar"><Brand /><div className="nav-label eyebrow">Workspace</div><nav className="side-nav">{nav.map(({ href, label, icon: Icon }) => <Link href={href} className={`side-link ${location === href || (href !== '/app' && location.startsWith(href)) ? 'active' : ''}`} key={href} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`}><Icon size={16} />{label}</Link>)}</nav><div className="side-bottom"><Link href="/app/studio" className="side-link" data-testid="link-new-design"><Plus size={16} />New design</Link><Link href="/designer/profile" className="side-link designer-entry" data-testid="link-designer-profile-builder"><Palette size={16} />For designers <ArrowUpRight size={13} /></Link><div className="profile-mini"><span className="avatar">{initials}</span><span>{displayName}</span><MoreHorizontal size={15} className="muted" /></div></div></aside><div className="mobile-header"><Brand /><div className="top-actions"><button className="icon-button" aria-label="Notifications" data-testid="button-notifications"><Bell size={16} /></button><Link href="/designer/profile" className="icon-button" aria-label="Designer profile builder" data-testid="link-mobile-designer-profile"><UserRound size={16} /></Link></div></div><main className="app-main"><div className="app-topbar"><div className="breadcrumbs"><span>ZARI WORKSPACE</span><ChevronRight size={12} /><span>{location === '/app' ? 'HOME' : location.includes('studio') ? 'DESIGN STUDIO' : location.startsWith('/designer') ? 'DESIGNER SPACE' : location.split('/')[1]?.toUpperCase()}</span></div><div className="top-actions"><button className="icon-button" aria-label="Search" data-testid="button-search"><Search size={16} /></button><button className="icon-button" aria-label="Notifications" data-testid="button-top-notifications"><Bell size={16} /></button></div></div>{children}</main><nav className="bottom-nav" aria-label="Mobile navigation">{nav.map(({ href, label, icon: Icon }) => <Link href={href} className={`bottom-link ${location === href ? 'active' : ''}`} key={href} data-testid={`link-mobile-${label}`}><Icon size={17} /><span>{label}</span></Link>)}</nav></div>;
}

function Toast({ toast, setToast }: { toast: ToastState; setToast: (toast: ToastState) => void }) {
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 2800); return () => window.clearTimeout(timer); }, [toast, setToast]);
  return toast ? <div className="toast-note" role="status" data-testid="status-toast">{toast.message}</div> : null;
}

function Home() {
  const [, setLocation] = useLocation();
  const [brief, setBrief] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const user = useCurrentUser();
  const { data: designs, isLive: designsLive } = useDesigns();
  const { data: designers, isLive: designersLive } = useDesigners();
  const submit = () => { if (brief.trim()) setLocation(`/app/studio?brief=${encodeURIComponent(brief)}`); else setToast({ message: 'Tell us one detail to begin your design.' }); };
  return <AppShell><div className="app-heading"><div><div className="eyebrow">Good morning{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</div><h1>What are you imagining?</h1><p>A sketch, a sentence, or a feeling. Start wherever you are.</p></div></div><section className="composer"><div><textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="A pastel lavender lehenga for my engagement..." aria-label="Describe your outfit" data-testid="input-outfit-brief" /><label className="upload-chip" htmlFor="inspiration-upload"><ImagePlus size={14} /> Add inspiration image <input id="inspiration-upload" type="file" accept="image/*" hidden onChange={() => setToast({ message: 'Inspiration added to your brief.' })} data-testid="input-inspiration-upload" /></label></div><div className="composer-side"><span className="eyebrow" style={{ color: 'hsl(39 42% 85%)' }}>{session.isSignedIn ? 'Saved to your account' : 'Guest mode · saved locally'}</span><Button variant="coral" onClick={submit} testId="button-create-design">Begin design <ArrowRight size={15} /></Button></div></section><div className="home-grid"><section><div className="subheading"><h2>Recent designs <DemoNote isLive={designsLive} /></h2><Link href="/app/designs" data-testid="link-all-designs">View all <ArrowRight size={13} /></Link></div><div className="design-grid">{designs.slice(0, 4).map((design) => <Link href={`/app/studio/${design.id}`} className="design-tile" key={design.id} data-testid={`card-recent-design-${design.id}`}><div className="design-thumb"><GarmentArt tone={design.tone} url={design.coverUrl} /></div><div className="tile-label"><strong>{design.name}</strong><span>{design.meta}</span></div></Link>)}</div></section><section><div className="subheading"><h2>For your moodboard</h2><Link href="/app/studio" data-testid="link-explore-recommendations">Explore <ArrowRight size={13} /></Link></div><div className="recommended">{['Soft tailoring, warm neutrals', 'The new occasion sari', 'Organza with a little air'].map((name, index) => <Link href="/app/studio" className="recommended-item" key={name} data-testid={`card-recommendation-${index}`}><div className="rec-art"></div><div><strong>{name}</strong><span>{['3 directions', '5 directions', '4 directions'][index]}</span></div><span className="score">{['94%', '89%', '91%'][index]}</span></Link>)}</div></section></div><section style={{ marginTop: 45 }}><div className="subheading"><h2>Designers to know <DemoNote isLive={designersLive} /></h2><Link href="/marketplace" data-testid="link-all-designers">See marketplace <ArrowRight size={13} /></Link></div><div className="designers-row">{designers.slice(0, 3).map((designer) => <Link href={`/designers/${designer.slug}`} className="designer-card" key={designer.id} data-testid={`card-designer-${designer.id}`}><span className="avatar">{designer.initials}</span><div><strong>{designer.name}</strong><small>{designer.city} · {designer.score} Quality Score</small></div><div className="designer-detail"><span>{designer.bid}</span><span>{designer.days}</span></div></Link>)}</div></section><Toast toast={toast} setToast={setToast} /></AppShell>;
}

function StudioStart() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const initialBrief = params.get('brief') || '';
  const [brief, setBrief] = useState(initialBrief);
  const [stage, setStage] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const generate = useGenerateDesign();
  const stages = ['Reading your occasion and constraints', 'Translating the idea into a silhouette', 'Checking construction and fabric logic', 'Preparing four directions for you'];

  // The stage list is the loading state the product asks for — progress within
  // the first second, never a bare spinner. It advances on a timer while the
  // real generation runs, and the navigation waits for the actual result.
  useEffect(() => {
    if (!generate.isPending) return;
    const interval = window.setInterval(() => setStage((current) => Math.min(current + 1, stages.length - 1)), 900);
    return () => window.clearInterval(interval);
  }, [generate.isPending, stages.length]);

  const start = () => {
    if (!brief.trim()) { setToast({ message: 'Tell us one detail to begin your design.' }); return; }
    setStage(0);
    if (!isApiConfigured) { window.setTimeout(() => setLocation('/app/studio/concepts'), 2600); return; }
    generate.mutate(brief.trim(), {
      onSuccess: () => setLocation('/app/studio/concepts'),
      onError: (error) => setToast({ message: error instanceof ApiError ? error.message : "Zari couldn't finish that design. Nothing is lost — try again." }),
    });
  };

  const working = generate.isPending || (!isApiConfigured && stage > 0);

  if (working) return <AppShell><section className="loading-stage"><div className="eyebrow">Design studio · working</div><div className="loading-orbit"><Sparkles size={23} /></div><h1>Giving your idea a shape.</h1><p>We are making the invisible details visible.</p><div className="stage-list">{stages.map((item, index) => <div className={`stage-row ${index <= stage ? 'done' : ''}`} key={item}><span className="stage-dot">{index < stage ? <Check size={7} /> : null}</span><span>{item}</span>{index === stage && <Loader2 size={13} className="spin" />}</div>)}</div></section></AppShell>;

  return <AppShell><div className="app-heading"><div><div className="eyebrow">Design studio / new brief</div><h1>Begin with the brief.</h1><p>Nothing needs to be perfect. Your designer will help you refine it.</p></div></div><section className="surface" style={{ padding: 30, maxWidth: 760 }}><div className="eyebrow">Your idea</div><textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Pastel lavender lehenga for my engagement under ₹10,000" aria-label="Design brief" data-testid="input-studio-brief" style={{ width: '100%', minHeight: 145, border: 0, outline: 0, resize: 'vertical', background: 'transparent', font: '400 34px/1.08 var(--app-font-serif)', marginTop: 15 }} /><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid hsl(var(--border))', paddingTop: 17, marginTop: 20, gap: 12, flexWrap: 'wrap' }}><label className="upload-chip" htmlFor="studio-upload"><Upload size={14} /> Attach a reference <input id="studio-upload" type="file" hidden data-testid="input-studio-upload" /></label><Button onClick={start} testId="button-generate-concepts">Show me directions <ArrowRight size={15} /></Button></div></section><div className="eyebrow" style={{ marginTop: 45, marginBottom: 15 }}>A useful starting point</div><div className="designers-row" style={{ marginTop: 0, maxWidth: 760 }}><div className="surface" style={{ padding: 17, fontSize: 13 }}><Sparkles size={16} color="hsl(var(--accent))" /><p style={{ lineHeight: 1.5 }}>Mention the occasion, colour, silhouette, and a budget if you have one.</p></div><div className="surface" style={{ padding: 17, fontSize: 13 }}><Palette size={16} color="hsl(var(--accent))" /><p style={{ lineHeight: 1.5 }}>We will show the construction choices behind the look.</p></div></div><Toast toast={toast} setToast={setToast} /></AppShell>;
}

function Concepts() {
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState(0);
  const { data: designs, isLive } = useDesigns();
  const concepts = designs.slice(0, 4);
  const chosen = concepts[selected] ?? concepts[0];
  const open = () => { if (chosen) setLocation(`/app/studio/${chosen.id}`); };
  const estimate = chosen?.estimateMin && chosen?.estimateMax
    ? `${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(chosen.estimateMin / 100)}–${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(chosen.estimateMax / 100)}`
    : '₹7,400–₹8,400';
  return <AppShell><div className="app-heading"><div><div className="eyebrow">Four directions · ready <DemoNote isLive={isLive} /></div><h1>Find the one that feels like you.</h1><p>Each direction can be refined, priced, and made by a real designer.</p></div><Button onClick={open} testId="button-open-selected-concept">Open selected <ArrowRight size={15} /></Button></div><section className="surface" style={{ padding: 13 }}><div className="concepts" style={{ marginTop: 0 }}>{concepts.map((concept, index) => <button className={`concept-card ${selected === index ? 'selected' : ''}`} onClick={() => setSelected(index)} key={concept.id} data-testid={`button-concept-${index}`}><div className="concept-visual"><GarmentArt tone={concept.tone} url={concept.coverUrl} /></div><div className="concept-copy"><strong>{concept.name}</strong><span>{index === selected ? 'SELECTED' : `0${index + 1}`}</span></div></button>)}</div></section><div className="surface" style={{ marginTop: 20, padding: 17, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}><span className="muted" style={{ fontSize: 12 }}>Selected direction: <b className="ink">{chosen?.name}</b> · Estimate {estimate}</span><Button onClick={open} variant="coral" testId="button-continue-studio">Continue to studio <ArrowRight size={15} /></Button></div></AppShell>;
}

function StudioWorkspace() {
  const params = useParams<{ designId: string }>();
  const { data: design, isLive } = useDesign(params.designId);
  const editDesign = useEditDesign(params.designId);
  const [view, setView] = useState('front');
  const [message, setMessage] = useState('');
  const [localMessages, setLocalMessages] = useState<string[]>([]);
  const [budget, setBudget] = useState('10000');
  const [substitute, setSubstitute] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);

  const messages = [...design.conversation, ...localMessages];

  const send = () => {
    const text = message.trim();
    if (!text) return;
    setLocalMessages((current) => [...current, text]);
    setMessage('');
    if (!isApiConfigured || !isLive) return;
    editDesign.mutate(text, {
      onSuccess: () => setToast({ message: 'New version created. Your earlier direction is still here.' }),
      onError: (error) => {
        // An unmanufacturable edit is a real product outcome, not a crash — the
        // message already explains what cannot be stitched.
        setToast({ message: error instanceof ApiError ? error.message : "Zari couldn't apply that change. Nothing is lost — try again." });
      },
    });
  };

  return <AppShell><div className="app-heading"><div><div className="eyebrow">Design studio / v{String(design.versionNumber).padStart(2, '0')} <DemoNote isLive={isLive} /></div><h1>{design.title}</h1><p>Created from your brief · Last edited just now</p></div><div className="studio-actions"><Button variant="ghost" onClick={() => setToast({ message: 'Share link copied to clipboard.' })} testId="button-share-design"><LinkIcon size={14} /> Share</Button><Button onClick={() => setToast({ message: 'Ask Zari for a change below — every edit becomes a new version.' })} testId="button-new-version"><Pencil size={14} /> Edit as new version</Button></div></div><div className="studio-layout"><section className="studio-canvas"><div className="canvas-top"><span>VERSION {String(design.versionNumber).padStart(2, '0')} / {view.toUpperCase()}</span><div className="view-controls">{['front', 'back', 'detail'].map((item) => <button className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item} data-testid={`button-view-${item}`}>{item}</button>)}</div></div><div className="canvas-garment"><GarmentArt /></div><div className="canvas-caption"><div><div className="eyebrow">{design.title.split(' ').slice(0, 2).join(' ')}</div><strong>{view === 'detail' ? 'Hand-finished neckline' : design.title}</strong></div><span>01 / 03 views</span></div></section><section className="studio-panel"><div className="surface studio-card"><h3><span className="eyebrow">Conversation · Zari</span></h3><div className="conversation">{messages.map((item, index) => <div className={`bubble ${index >= design.conversation.length ? 'bubble-user' : 'bubble-designer'}`} key={`${item}-${index}`}>{item}</div>)}{editDesign.isPending && <div className="bubble bubble-designer"><Loader2 size={13} className="spin" /> Working on that change…</div>}</div><div className="message-form"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} placeholder="Ask Zari to change anything..." aria-label="Ask Zari to change the design" data-testid="input-designer-message" /><button onClick={send} aria-label="Send message" data-testid="button-send-message"><Send size={14} /></button></div></div><div className="surface studio-card"><h3>Design attributes</h3><div className="attribute-list">{design.attributes.map((attribute) => <div className="attribute" key={attribute.label}><span>{attribute.label}</span><strong>{attribute.value}</strong></div>)}</div></div><div className="surface studio-card estimate-card"><h3>Estimate, before a final quote</h3>{design.costLines.map((line) => <div className="cost-row" key={line.label}><span>{line.label}</span><span>{line.amount}</span></div>)}<div className="cost-total"><span className="muted" style={{ fontSize: 11 }}>Working estimate</span><strong>{design.estimateLabel}</strong></div><p className="muted" style={{ fontSize: 11, lineHeight: 1.45, marginBottom: 0 }}>A designer confirms the final quote after measurements and fabric availability.</p></div><div className="surface studio-card"><h3>Makeability check</h3><div className="quality-grid"><div><strong>{design.makeability.score}</strong><span>Possible</span></div><div><strong>{design.makeability.complexity}</strong><span>Complexity</span></div><div><strong>{design.makeability.leadTime}</strong><span>Days</span></div></div><div className="progress-line" style={{ marginTop: 17 }}><span style={{ width: design.makeability.score === '—' ? '0%' : design.makeability.score }} /></div></div><div className="studio-card optimizer"><div className="eyebrow" style={{ color: 'hsl(39 42% 86%)' }}>Budget optimizer</div><h3>Keep the feeling. Change the levers.</h3><p className="muted" style={{ fontSize: 11, lineHeight: 1.45 }}>Set a target and see what can move without losing the design.</p><div className="budget-field"><span>₹</span><input value={budget} onChange={(event) => setBudget(event.target.value.replace(/\D/g, ''))} aria-label="Target budget" data-testid="input-target-budget" /></div><div className="plan active"><div className="plan-head"><strong>Best balance</strong><b>₹4,900</b></div><p>Swap chanderi silk for a silk-blend and simplify the inner lining.</p><div className="plan-foot"><span>94% visual similarity · Save ₹3,400</span><input type="checkbox" className="toggle" checked={substitute} onChange={() => setSubstitute(!substitute)} aria-label="Toggle fabric substitution" data-testid="toggle-substitution" /></div></div><div className="plan"><div className="plan-head"><strong>Keep the craft</strong><b>₹6,150</b></div><p>Retain the fabric; reduce pearlwork on the dupatta border.</p><div className="plan-foot"><span>97% visual similarity · Save ₹2,250</span><input type="checkbox" className="toggle" aria-label="Toggle craft plan" data-testid="toggle-craft-plan" /></div></div></div><div className="studio-actions"><Button variant="ghost" onClick={() => setToast({ message: 'Design duplicated as a new version.' })} testId="button-duplicate-design"><Copy size={14} /> Duplicate</Button><Button variant="coral" onClick={() => setToast({ message: 'Opening designer matches for this design.' })} testId="button-find-designer">Find my designer <ArrowRight size={14} /></Button></div></section></div><Toast toast={toast} setToast={setToast} /></AppShell>;
}

function DesignsPage() {
  const [, setLocation] = useLocation();
  const { data: designs, isLive, refetch } = useDesigns();
  const [removed, setRemoved] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const items = designs.filter((design) => !removed.includes(design.id));
  // Optimistic: the card disappears immediately, the archive call follows.
  const remove = (id: string, name: string) => {
    setRemoved((current) => [...current, id]);
    setToast({ message: `${name} archived.` });
    if (isLive) void designsService.remove(id).then(refetch).catch(() => undefined);
  };
  return <AppShell><div className="app-heading"><div><div className="eyebrow">Your workspace <DemoNote isLive={isLive} /></div><h1>My designs</h1><p>Keep every direction. Make a new version when the idea shifts.</p></div><Button onClick={() => setLocation('/app/studio')} testId="button-new-design"><Plus size={15} /> New design</Button></div>{items.length ? <div className="saved-grid">{items.map((design) => <article className="saved-card" key={design.id}><Link href={`/app/studio/${design.id}`} data-testid={`link-saved-design-${design.id}`}><div className="design-thumb"><GarmentArt tone={design.tone} url={design.coverUrl} /></div></Link><div className="saved-actions"><div><strong>{design.name}</strong><div className="muted" style={{ fontSize: 10, marginTop: 4 }}>{design.meta}</div></div><div className="action-row"><button className="icon-button" aria-label={`Duplicate ${design.name}`} onClick={() => setToast({ message: `${design.name} duplicated as a new version.` })} data-testid={`button-duplicate-${design.id}`}><Copy size={14} /></button><button className="icon-button" aria-label={`Share ${design.name}`} onClick={() => setToast({ message: 'Share link copied.' })} data-testid={`button-share-${design.id}`}><LinkIcon size={14} /></button><button className="icon-button" aria-label={`Delete ${design.name}`} onClick={() => remove(design.id, design.name)} data-testid={`button-delete-${design.id}`}><Trash2 size={14} /></button></div></div></article>)}</div> : <div className="empty-state"><Shirt size={23} /><h3>Your next favourite is not here yet.</h3><p>Begin with a sentence and we will make you a first direction.</p><Button onClick={() => setLocation('/app/studio')} testId="button-empty-new-design">Start a design</Button></div>}<Toast toast={toast} setToast={setToast} /></AppShell>;
}

function Marketplace() {
  const [toast, setToast] = useState<ToastState>(null);
  const { data: designers, isLive } = useDesigners();
  const { data: designs } = useDesigns();
  const brief = designs[0];
  const request = (name: string) => setToast({ message: `Quote request sent to ${name}. They usually reply within a day.` });
  return <AppShell><div className="app-heading"><div><div className="eyebrow">Matched to your design <DemoNote isLive={isLive} /></div><h1>Meet your makers.</h1><p>Compare the humans behind the hands. No hidden marketplace ranking.</p></div><Button variant="ghost" onClick={() => setToast({ message: 'Filters are ready for your next search.' })} testId="button-marketplace-filters"><Settings size={14} /> Filters</Button></div><div className="guest-banner"><ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Quality Score is built from on-time delivery, fit outcomes, communication, and Zari QC — not paid placement.</div><div className="marketplace-grid"><section><div className="surface studio-card"><div className="eyebrow">Your selected brief</div><h2 style={{ font: '400 31px var(--app-font-serif)', margin: '10px 0 7px' }}>{brief?.name ?? 'Pastel Lavender Engagement Lehenga'}</h2><p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Flared A-line · Chanderi silk · Resham + pearls</p><div className="cost-total"><span className="muted" style={{ fontSize: 11 }}>Estimate</span><strong>₹7,400–₹8,400</strong></div><Link href={`/app/studio/${brief?.id ?? 'lavender-lehenga'}`} className="text-link" style={{ marginTop: 16 }} data-testid="link-review-design">Review design <ArrowRight size={13} /></Link></div><div className="surface designer-invite"><div className="eyebrow">Are you a designer?</div><h3>Build a studio people can trust.</h3><p>Show your craft, your process, and the work you want to be matched with.</p><Link href="/designer/profile" className="text-link" data-testid="link-marketplace-designer-builder">Create your profile <ArrowRight size={13} /></Link></div></section><section className="quote-list">{designers.map((designer, index) => <article className={`match-card ${index === 0 ? 'featured' : ''}`} key={designer.id}><div className="match-top"><span className="avatar">{designer.initials}</span><div><Link href={`/designers/${designer.slug}`} className="match-name" data-testid={`link-designer-profile-${designer.id}`}><strong>{designer.name}</strong></Link><span>{designer.city} · Verified studio</span></div><span className="score" style={{ marginLeft: 'auto' }}>{index === 0 ? 'BEST MATCH' : 'MATCHED'}</span></div><div className="verified"><ShieldCheck size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Quality Score {designer.score}</div><div className="match-stats"><div><strong>{designer.bid}</strong><span>Indicative</span></div><div><strong>{designer.days}</strong><span>Lead time</span></div><div><strong>{index === 0 ? '98%' : `${94 - index * 3}%`}</strong><span>Fit success</span></div></div><p>Specialises in occasionwear with thoughtful fit notes and a clear approval process before cutting.</p><div className="match-buttons"><Link href={`/designers/${designer.slug}`} className="button button-ghost" data-testid={`button-view-profile-${designer.id}`}><Eye size={14} /> View profile</Link><Button variant={index === 0 ? 'coral' : 'primary'} onClick={() => request(designer.name)} testId={`button-request-quote-${designer.id}`}>Request quote <ArrowRight size={14} /></Button></div></article>)}</section></div><Toast toast={toast} setToast={setToast} /></AppShell>;
}

function DesignerProfile() {
  const params = useParams<{ designerId: string }>();
  const { data: profile, isLive } = useDesignerProfile(params.designerId);
  const [toast, setToast] = useState<ToastState>(null);
  return <AppShell><div className="profile-hero"><div className="profile-hero-art" data-tone={profile.tone}><span className="avatar profile-avatar">{profile.initials}</span></div><div className="profile-hero-copy"><div className="eyebrow">Verified Zari studio <DemoNote isLive={isLive} /></div><h1>{profile.name}</h1><div className="profile-location"><MapPin size={14} /> {profile.city}, India <span className="verified-inline"><ShieldCheck size={13} /> Verified</span></div><p>{profile.bio}</p><div className="profile-actions"><Button variant="coral" onClick={() => setToast({ message: `Quote request sent to ${profile.name}.` })} testId="button-profile-request-quote">Request a quote <ArrowRight size={14} /></Button><Button variant="ghost" onClick={() => setToast({ message: `Message thread opened with ${profile.name}.` })} testId="button-profile-message"><MessageCircle size={14} /> Message studio</Button></div></div><div className="profile-score-card"><div className="eyebrow">Zari Quality Score</div><strong>{profile.score}</strong><span>Excellent match</span><div className="score-stars"><Star size={13} fill="currentColor" /> {profile.rating} <small>({profile.reviews} reviews)</small></div><Link href="#score-details" className="text-link" data-testid="link-score-details">How this is calculated <ArrowRight size={12} /></Link></div></div><div className="profile-metrics"><div><span>Typical lead time</span><strong>{profile.leadTime}</strong></div><div><span>Current capacity</span><strong>{profile.capacity}</strong></div><div><span>Customer rating</span><strong>{profile.rating} / 5</strong></div><div><span>Studio location</span><strong>{profile.city}</strong></div></div><section className="profile-content"><div><div className="subheading"><h2>Selected work</h2><span className="eyebrow">{profile.portfolio.length} pieces</span></div><div className="portfolio-grid">{profile.portfolio.map((piece) => <article className="portfolio-piece" key={piece.name}><div className="portfolio-art" data-tone={piece.tone}><GarmentArt tone={piece.tone} url={piece.imageUrl} /></div><div><strong>{piece.name}</strong><span>{piece.category}</span></div></article>)}</div></div><aside className="profile-sidebar"><div className="surface profile-panel"><div className="eyebrow">What this studio does best</div><div className="specialty-list">{profile.specialties.map((specialty) => <span key={specialty}>{specialty}</span>)}</div></div><div className="surface profile-panel" id="score-details"><div className="eyebrow">Quality Score, made legible</div><p className="muted">Zari combines the signals that matter when choosing a maker — not just the lowest price.</p>{[['Design similarity', '96%'], ['Craft skill', `${profile.score}%`], ['On-time delivery', '97%'], ['Communication', '95%']].map(([label, value]) => <div className="score-breakdown" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="profile-trust"><ShieldCheck size={16} /><span>Payment stays in escrow until Zari quality control passes.</span></div></aside></section><Toast toast={toast} setToast={setToast} /></AppShell>;
}

function DesignerProfileBuilder() {
  const [profile, setProfile] = useState({ ...mockDesignerProfiles['aanya-studio']! });
  const [specialties, setSpecialties] = useState(profile.specialties.join(', '));
  const [toast, setToast] = useState<ToastState>(null);
  const update = (key: 'name' | 'city' | 'bio' | 'leadTime' | 'capacity', value: string) => setProfile((current) => ({ ...current, [key]: value }));
  const save = () => {
    setProfile((current) => ({ ...current, specialties: specialties.split(',').map((item) => item.trim()).filter(Boolean) }));
    setToast({ message: 'Your studio profile is saved and ready for review.' });
  };
  return <AppShell><div className="app-heading builder-heading"><div><div className="eyebrow">Designer space / profile</div><h1>Build your studio.</h1><p>Help the right customers find you for the work you do best.</p></div><div className="studio-actions"><Link href="/designers/aanya-studio" className="button button-ghost" data-testid="link-preview-designer-profile"><Eye size={14} /> Preview public profile</Link><Button variant="coral" onClick={save} testId="button-save-designer-profile"><Save size={14} /> Save profile</Button></div></div><div className="builder-layout"><section className="builder-form"><div className="surface builder-section"><div className="builder-section-heading"><div><div className="eyebrow">01 / Studio identity</div><h2>Tell your story.</h2></div><span className="completion">Complete</span></div><div className="form-field"><label htmlFor="studio-name">Studio name</label><input id="studio-name" value={profile.name} onChange={(event) => update('name', event.target.value)} data-testid="input-studio-name" /></div><div className="form-grid"><div className="form-field"><label htmlFor="studio-city">Based in</label><input id="studio-city" value={profile.city} onChange={(event) => update('city', event.target.value)} data-testid="input-studio-city" /></div><div className="form-field"><label htmlFor="studio-lead-time">Typical lead time</label><input id="studio-lead-time" value={profile.leadTime} onChange={(event) => update('leadTime', event.target.value)} data-testid="input-studio-lead-time" /></div></div><div className="form-field"><label htmlFor="studio-bio">Studio introduction</label><textarea id="studio-bio" value={profile.bio} onChange={(event) => update('bio', event.target.value)} data-testid="input-studio-bio" /></div></div><div className="surface builder-section"><div className="builder-section-heading"><div><div className="eyebrow">02 / Craft & capacity</div><h2>Show the details that make you distinct.</h2></div></div><div className="form-field"><label htmlFor="studio-specialties">Specialties <span>Separate with commas</span></label><input id="studio-specialties" value={specialties} onChange={(event) => setSpecialties(event.target.value)} data-testid="input-studio-specialties" /></div><div className="form-field"><label htmlFor="studio-capacity">Current capacity</label><select id="studio-capacity" value={profile.capacity} onChange={(event) => update('capacity', event.target.value)} data-testid="select-studio-capacity"><option>Available for new work</option><option>68% full</option><option>74% full</option><option>82% full</option><option>Fully booked</option></select></div><div className="builder-check"><Check size={15} /><div><strong>Verified craft profile</strong><span>Show customers that your identity, studio location, and work samples have been reviewed.</span></div><span className="status-pill">IN REVIEW</span></div></div><div className="surface builder-section"><div className="builder-section-heading"><div><div className="eyebrow">03 / Portfolio</div><h2>Let the work speak first.</h2></div><Button variant="soft" onClick={() => setToast({ message: 'Portfolio upload is ready for your next image.' })} testId="button-add-portfolio"><Plus size={14} /> Add work</Button></div><div className="upload-dropzone"><Camera size={18} /><strong>Drop fashion images here</strong><span>Use 4:5 images that show the garment clearly. You can add tags after upload.</span><label className="text-link" htmlFor="portfolio-upload">Choose files <input id="portfolio-upload" type="file" accept="image/*" multiple hidden onChange={() => setToast({ message: 'Portfolio images added. Tags are ready to review.' })} data-testid="input-portfolio-upload" /></label></div><div className="builder-portfolio-row">{profile.portfolio.slice(0, 3).map((piece) => <div className="builder-piece" key={piece.name}><div className="portfolio-art" data-tone={piece.tone}><GarmentArt tone={piece.tone} /></div><span>{piece.category.split(' · ')[0]}</span></div>)}</div></div></section><aside className="builder-preview"><div className="preview-label"><span className="eyebrow">Live preview</span><span><Eye size={13} /> Public profile</span></div><div className="surface public-preview"><div className="preview-cover" data-tone={profile.tone}><span className="avatar">{profile.initials}</span></div><div className="preview-body"><div className="eyebrow">Verified Zari studio</div><h2>{profile.name || 'Your studio name'}</h2><div className="profile-location"><MapPin size={13} /> {profile.city || 'Your city'}</div><p>{profile.bio || 'Your studio story will appear here.'}</p><div className="specialty-list">{(specialties ? specialties.split(',') : ['Your specialties']).slice(0, 4).map((item) => <span key={item}>{item.trim()}</span>)}</div><div className="preview-score"><strong>{profile.score}</strong><span>Quality Score</span></div></div></div><div className="profile-trust"><ShieldCheck size={16} /><span>Your profile is reviewed before it appears in designer matches.</span></div></aside></div><Toast toast={toast} setToast={setToast} /></AppShell>;
}

function Orders() {
  const [, setLocation] = useLocation();
  const { data: orders, isLive } = useOrders();
  return <AppShell><div className="app-heading"><div><div className="eyebrow">After the yes <DemoNote isLive={isLive} /></div><h1>Orders</h1><p>One calm place for production, payment, and fit.</p></div></div>{orders.length ? <div className="orders-list">{orders.map((order) => <div className="surface order-row" key={order.id}><div className="order-thumb"><GarmentArt tone={order.tone} /></div><div><strong>{order.title}</strong><p>{order.meta}</p></div><div><span className="status-pill">{order.statusLabel}</span><button className="text-link" onClick={() => setLocation(`/orders/${order.id}`)} style={{ marginTop: 8 }} data-testid={`button-view-order-${order.code}`}>View order <ArrowRight size={13} /></button></div></div>)}</div> : <div className="empty-state"><WalletCards size={23} /><h3>No orders yet.</h3><p>Once you choose a designer, everything about your garment lives here.</p><Button onClick={() => setLocation('/marketplace')} testId="button-empty-find-designer">Find a designer</Button></div>}</AppShell>;
}

function OrderDetail() {
  const params = useParams<{ orderId: string }>();
  const { data: orders } = useOrders();
  const order = orders.find((o) => o.id === params.orderId || o.code === params.orderId) ?? orders[0];
  const [toast, setToast] = useState<ToastState>(null);
  return <AppShell><div className="app-heading"><div><div className="eyebrow"><Link href="/orders" data-testid="link-back-orders">Orders</Link> / {order?.code ?? params.orderId}</div><h1>Order {order?.code ?? params.orderId}</h1><p>{order?.designerName} · Accepted 16 Nov</p></div><span className="status-pill">{order?.statusLabel ?? 'IN PRODUCTION'}</span></div><div className="order-detail"><section className="surface order-summary"><div className="order-thumb" style={{ width: 120, height: 135 }}><GarmentArt tone={order?.tone} /></div><h2>{order?.title}</h2><div className="cost-row"><span>Final quote</span><strong>₹6,400</strong></div><div className="cost-row"><span>First payment · 40%</span><span>₹2,560 paid</span></div><div className="cost-row"><span>Balance after QC · 60%</span><span>₹3,840</span></div><div className="timeline"><div className="timeline-row done"><span className="timeline-dot"></span><div><strong>Order accepted</strong><small>16 Nov · Escrow funded</small></div></div><div className="timeline-row done"><span className="timeline-dot"></span><div><strong>Measurements received</strong><small>17 Nov · Fit notes approved</small></div></div><div className="timeline-row done"><span className="timeline-dot"></span><div><strong>Cutting and construction</strong><small>In progress · {order?.designerName}</small></div></div><div className="timeline-row"><span className="timeline-dot"></span><div><strong>Zari quality control</strong><small>We check finish, measurements, and brief</small></div></div><div className="timeline-row"><span className="timeline-dot"></span><div><strong>Dispatched to you</strong><small>Estimated 28 Nov</small></div></div></div><Button variant="ghost" onClick={() => setToast({ message: `Message sent to ${order?.designerName}.` })} testId="button-message-order"><MessageCircle size={14} /> Message {order?.designerName}</Button></section><aside style={{ display: 'grid', alignContent: 'start', gap: 15 }}><div className="escrow surface"><div className="eyebrow" style={{ color: 'hsl(39 42% 86%)' }}>Protected payment</div><h3>Escrow, not blind trust.</h3><p>Your payment stays protected while the garment is being made. Your designer receives the balance only after Zari quality control passes.</p><div className="escrow-row"><span>At acceptance</span><strong>40% · ₹2,560</strong></div><div className="escrow-row"><span>After Zari QC</span><strong>60% · ₹3,840</strong></div></div><div className="surface studio-card"><div className="eyebrow">When it arrives</div><h3 style={{ font: '400 26px var(--app-font-serif)', margin: '10px 0 6px' }}>Your fit window</h3><p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>You have 7 days to try it on. If something needs adjusting, your first alteration is free.</p><Button variant="soft" onClick={() => setToast({ message: 'We will remind you when your fit window opens.' })} testId="button-fit-reminder">Remind me</Button></div><div className="surface studio-card"><div className="eyebrow">Quality control</div><div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 15 }}><span className="avatar" style={{ background: 'hsl(var(--secondary))', color: 'hsl(var(--primary))' }}><Check size={15} /></span><div><strong style={{ fontSize: 13 }}>Brief matched</strong><div className="muted" style={{ fontSize: 11 }}>Next check after construction</div></div></div></div></aside></div><Toast toast={toast} setToast={setToast} /></AppShell>;
}

function AuthPage({ signup = false }: { signup?: boolean }) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const { signup: signupMutation, login: loginMutation } = useAuthActions();
  const pending = signupMutation.isPending || loginMutation.isPending;

  const submit = () => {
    if (!email) { setToast({ message: 'Add an email to keep your design safe.' }); return; }
    if (!isApiConfigured) { setLocation('/app'); return; }
    if (!password) { setToast({ message: 'Enter your password to continue.' }); return; }

    const onError = (error: unknown) => setToast({ message: error instanceof ApiError ? error.message : 'That did not work. Please try again.' });
    const onSuccess = (result: { claimedDesigns: number }) => {
      // The claim-on-signup moment: their guest work followed them in.
      if (result.claimedDesigns > 0) setToast({ message: `Welcome. ${result.claimedDesigns} design${result.claimedDesigns === 1 ? '' : 's'} moved into your account.` });
      setLocation('/app');
    };

    if (signup) signupMutation.mutate({ email, password, name: name || email.split('@')[0]! }, { onSuccess, onError });
    else loginMutation.mutate({ email, password }, { onSuccess, onError });
  };

  return <main className="auth-page"><aside className="auth-aside"><Brand dark /><div><div className="eyebrow" style={{ color: 'hsl(39 42% 86%)' }}>Your design is waiting for you</div><h1>Keep the idea.<br /><em>Keep the feeling.</em></h1><p>Create a Zari account to save your brief, return to your studio, and talk to a designer when you are ready.</p></div><span className="mono" style={{ fontSize: 10, opacity: .65 }}>ZARI / MADE SLOWLY IN INDIA</span></aside><section className="auth-form-wrap"><div className="auth-form"><div className="eyebrow">Welcome to Zari</div><h2>{signup ? 'Make room for the idea.' : 'Good to see you.'}</h2><p>{signup ? 'A small account keeps your designs, notes, and quotes together.' : 'Sign in to return to your design studio.'}</p><div className="guest-banner"><LockKeyhole size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Your current design is kept safe and moves into your account when you sign in.</div><div className="form-field"><label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" data-testid="input-auth-email" /></div>{signup && <div className="form-field"><label htmlFor="auth-name">Your name</label><input id="auth-name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Anika Narang" data-testid="input-auth-name" /></div>}<div className="form-field"><label htmlFor="auth-password">Password</label><input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} placeholder="At least 8 characters" data-testid="input-auth-password" /></div><Button onClick={submit} disabled={pending} testId={`button-${signup ? 'signup' : 'login'}`}>{pending ? 'One moment…' : signup ? 'Create account' : 'Continue'} <ArrowRight size={15} /></Button><div className="auth-foot">{signup ? <>Already have an account? <Link href="/login" data-testid="link-auth-login">Sign in</Link></> : <>New to Zari? <Link href="/signup" data-testid="link-auth-signup">Create an account</Link></>}</div></div><Toast toast={toast} setToast={setToast} /></section></main>;
}

function Router() {
  return <Switch><Route path="/" component={Landing} /><Route path="/app" component={Home} /><Route path="/app/studio" component={StudioStart} /><Route path="/app/studio/concepts" component={Concepts} /><Route path="/app/studio/:designId" component={StudioWorkspace} /><Route path="/app/designs" component={DesignsPage} /><Route path="/app/marketplace" component={Marketplace} /><Route path="/marketplace" component={Marketplace} /><Route path="/designers/:designerId" component={DesignerProfile} /><Route path="/designer/profile" component={DesignerProfileBuilder} /><Route path="/app/orders" component={Orders} /><Route path="/orders" component={Orders} /><Route path="/app/orders/:orderId" component={OrderDetail} /><Route path="/orders/:orderId" component={OrderDetail} /><Route path="/login" component={() => <AuthPage />} /><Route path="/signup" component={() => <AuthPage signup />} /><Route component={NotFound} /></Switch>;
}

function App() {
  useGuestBootstrap();
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
