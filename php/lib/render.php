<?php
// Public biolink rendering + tracking pixels + JS challenge + event logging.

function pp_log_event($type, $ref_id, $ctx) {
  try {
    $st = db()->prepare('INSERT INTO events (type, ref_id, country, is_bot, is_dc, ua, ip, source) VALUES (?,?,?,?,?,?,?,?)');
    $st->execute([$type, $ref_id, $ctx['country'], $ctx['isBot'] ? 1 : 0, $ctx['isDatacenter'] ? 1 : 0,
                  substr($ctx['ua'], 0, 300), $ctx['ip'], $ctx['source'] ?? '']);
  } catch (Throwable $e) {}
}

function pp_presets() {
  return [
    'midnight' => ['bg' => 'linear-gradient(160deg,#0f172a,#1e293b)', 'text_color' => '#f8fafc', 'accent' => '#6366f1'],
    'aurora' => ['bg' => 'linear-gradient(160deg,#0f2027,#203a43,#2c5364)', 'text_color' => '#eafff7', 'accent' => '#2dd4bf'],
    'sunset' => ['bg' => 'linear-gradient(160deg,#42275a,#734b6d)', 'text_color' => '#fff5f7', 'accent' => '#fb7185'],
    'candy' => ['bg' => 'linear-gradient(160deg,#ff9a9e,#fecfef)', 'text_color' => '#3a2330', 'accent' => '#d946ef'],
    'forest' => ['bg' => 'linear-gradient(160deg,#134e5e,#71b280)', 'text_color' => '#f0fff4', 'accent' => '#34d399'],
    'mono' => ['bg' => '#0b0b0c', 'text_color' => '#fafafa', 'accent' => '#a3a3a3'],
    'light' => ['bg' => 'linear-gradient(160deg,#f8fafc,#e2e8f0)', 'text_color' => '#0f172a', 'accent' => '#6366f1'],
  ];
}
function pp_fonts() {
  return [
    'Inter' => 'Inter:wght@400;600;800',
    'Poppins' => 'Poppins:wght@400;600;800',
    'Montserrat' => 'Montserrat:wght@400;600;800',
    'Space Grotesk' => 'Space+Grotesk:wght@400;600;700',
  ];
}

function pp_effective_pixels($pagePixels) {
  $global = json_decode(get_setting('global_pixels', '{}') ?: '{}', true) ?: [];
  $p = is_array($pagePixels) ? $pagePixels : [];
  $j = fn($k) => trim(($p[$k] ?? '') !== '' ? $p[$k] : ($global[$k] ?? ''));
  return [
    'fb' => $j('fb'), 'tiktok' => $j('tiktok'), 'ga' => $j('ga'),
    'custom_head' => trim(($global['custom_head'] ?? '') . "\n" . ($p['custom_head'] ?? '')),
    'custom_body' => trim(($global['custom_body'] ?? '') . "\n" . ($p['custom_body'] ?? '')),
  ];
}

function pp_pixel_head($px) {
  $out = '';
  if ($px['fb']) { $id = e($px['fb']);
    $out .= "<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','$id');fbq('track','PageView');</script>";
  }
  if ($px['tiktok']) { $id = e($px['tiktok']);
    $out .= "<script>!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i='https://analytics.tiktok.com/i18n/pixel/events.js';ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement('script');o.type='text/javascript';o.async=!0;o.src=i+'?sdkid='+e+'&lib='+t;var a=d.getElementsByTagName('script')[0];a.parentNode.insertBefore(o,a)};ttq.load('$id');ttq.page()}(window,document,'ttq');</script>";
  }
  if ($px['ga']) { $id = e($px['ga']);
    $out .= "<script async src=\"https://www.googletagmanager.com/gtag/js?id=$id\"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','$id');</script>";
  }
  if ($px['custom_head']) $out .= $px['custom_head'];
  return $out;
}
function pp_pixel_click_script($px) {
  if (!$px['fb'] && !$px['tiktok'] && !$px['ga'] && !$px['custom_body']) return '';
  return "<script>(function(){function track(){try{if(window.fbq)fbq('track','Lead');if(window.ttq)ttq.track('ClickButton');if(window.gtag)gtag('event','select_content',{content_type:'button'});}catch(e){}}document.addEventListener('click',function(e){var a=e.target.closest('a.btn');if(!a)return;e.preventDefault();track();setTimeout(function(){window.location.href=a.getAttribute('href')},180);});})();</script>";
}

function pp_js_challenge($targetUrl) {
  $enc = base64_encode($targetUrl);
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">'
    . '<title>Redirecting…</title><style>body{font-family:system-ui;background:#0b1120;color:#cbd5e1;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}</style></head>'
    . '<body><div>Mengalihkan…</div><script>(function(){try{var u=atob("' . $enc . '");document.cookie="pp_ck=1;path=/;max-age=3600";setTimeout(function(){location.replace(u)},120)}catch(e){}})();</script></body></html>';
}

function pp_render_page($page, $buttons, $ownerPreview = false) {
  $theme = json_decode($page['theme'] ?: '{}', true) ?: [];
  $pagePixels = json_decode($page['pixels'] ?: '{}', true) ?: [];
  // In owner preview, don't fire tracking pixels (avoids fake conversions/views).
  $px = $ownerPreview ? ['fb' => '', 'tiktok' => '', 'ga' => '', 'custom_head' => '', 'custom_body' => ''] : pp_effective_pixels($pagePixels);
  $presets = pp_presets(); $fonts = pp_fonts();
  $preset = $presets[$theme['preset'] ?? ''] ?? [];
  $bg = $theme['bg'] ?? ($preset['bg'] ?? $presets['midnight']['bg']);
  $textColor = $theme['text_color'] ?? ($preset['text_color'] ?? '#f8fafc');
  $accent = $theme['accent'] ?? ($preset['accent'] ?? '#6366f1');
  $glass = ($theme['glass'] ?? true) !== false;
  $blur = $glass ? 'blur(6px)' : 'none';
  $animate = ($theme['animate'] ?? true) !== false;
  $fontName = isset($fonts[$theme['font'] ?? '']) ? $theme['font'] : null;
  $fontStack = $fontName ? "'$fontName',system-ui,sans-serif" : "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  $fontLink = $fontName
    ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=' . $fonts[$fontName] . '&display=swap" rel="stylesheet">'
    : '';
  $radius = ['filled' => '14px', 'outline' => '14px', 'soft' => '14px', 'pill' => '999px'];

  $btnHtml = '';
  $i = 0;
  foreach ($buttons as $b) {
    $r = $radius[$b['style']] ?? '14px';
    if ($b['style'] === 'outline') $style = "background:transparent;color:" . e($b['bg_color']) . ";border:2px solid " . e($b['bg_color']) . ";";
    elseif ($b['style'] === 'soft') $style = "background:" . e($b['bg_color']) . "22;color:" . e($b['text_color']) . ";border:1px solid " . e($b['bg_color']) . "55;";
    else $style = "background:" . e($b['bg_color']) . ";color:" . e($b['text_color']) . ";border:none;";
    $delay = $animate ? "style=\"$style;border-radius:$r;animation-delay:" . (0.05 * $i + 0.1) . "s\"" : "style=\"$style;border-radius:$r\"";
    $icon = $b['icon'] ? '<span class="icon">' . e($b['icon']) . '</span>' : '';
    $cls = $animate ? 'btn in' : 'btn';
    $btnHtml .= "<a class=\"$cls\" href=\"r/b/{$b['id']}\" $delay>$icon<span>" . e($b['label']) . "</span><span class=\"arrow\">↗</span></a>\n";
    $i++;
  }

  $avatar = $page['avatar']
    ? '<img class="avatar" src="' . e($page['avatar']) . '" alt="' . e($page['title']) . '">'
    : '<div class="avatar placeholder">' . e(mb_strtoupper(mb_substr($page['title'] ?: '?', 0, 1))) . '</div>';

  $title = e($page['title'] ?: $page['slug']);
  $desc = e($page['description']);
  $ogimg = $page['avatar'] ? '<meta property="og:image" content="' . e($page['avatar']) . '">' : '';
  $bioHtml = $page['description'] ? '<p class="bio">' . $desc . '</p>' : '';
  $body = $btnHtml ?: '<p class="empty">Belum ada tombol yang tersedia.</p>';
  $pixelHead = pp_pixel_head($px);
  $pixelBody = ($px['custom_body'] ?: '') . pp_pixel_click_script($px);
  $previewBanner = $ownerPreview
    ? '<div style="position:fixed;top:0;left:0;right:0;z-index:99;background:#f59e0b;color:#1c1300;font:600 13px system-ui;text-align:center;padding:7px 10px">👁️ Pratinjau pemilik — cloaking diabaikan. Pengunjung asli tetap kena aturan cloaking.</div>'
    : '';

  return <<<HTML
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$title</title>
<meta name="description" content="$desc">
<meta property="og:title" content="$title">
<meta property="og:description" content="$desc">
<meta name="theme-color" content="{$accent}">
$ogimg
$fontLink
$pixelHead
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:$fontStack;min-height:100vh;background:$bg;background-attachment:fixed;color:$textColor;display:flex;justify-content:center;padding:56px 18px 40px}
  .wrap{width:100%;max-width:520px;text-align:center}
  .avatar{width:104px;height:104px;border-radius:50%;object-fit:cover;margin:0 auto 18px;display:block;border:3px solid $accent;box-shadow:0 0 0 6px {$accent}22,0 12px 30px rgba(0,0,0,.3)}
  .avatar.placeholder{display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:800;background:$accent;color:#fff}
  h1{font-size:23px;font-weight:800;margin-bottom:6px}
  .bio{opacity:.85;font-size:15px;margin-bottom:30px;white-space:pre-wrap;line-height:1.5}
  .btn{position:relative;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px 44px;margin-bottom:14px;text-decoration:none;font-weight:600;font-size:16px;backdrop-filter:$blur;box-shadow:0 6px 18px rgba(0,0,0,.18);transition:transform .12s ease,box-shadow .15s ease,filter .15s ease}
  .btn:hover{transform:translateY(-3px) scale(1.01);box-shadow:0 12px 26px rgba(0,0,0,.28);filter:brightness(1.06)}
  .btn .icon{font-size:19px}
  .btn .arrow{position:absolute;right:16px;opacity:0;transition:opacity .15s,transform .15s;transform:translateX(-4px)}
  .btn:hover .arrow{opacity:.7;transform:translateX(0)}
  .btn.in{opacity:0;transform:translateY(12px);animation:rise .5s ease forwards}
  @keyframes rise{to{opacity:1;transform:translateY(0)}}
  .empty{opacity:.7;font-size:15px}
  .footer{margin-top:34px;opacity:.55;font-size:12px}.footer a{color:inherit;font-weight:600}
  @media (prefers-reduced-motion:reduce){.btn.in{animation:none;opacity:1;transform:none}}
</style>
</head>
<body>
  $previewBanner
  <main class="wrap">
    $avatar
    <h1>$title</h1>
    $bioHtml
    $body
    <div class="footer">⚡ Dibuat dengan <a href="panel/">page-page</a></div>
  </main>
  $pixelBody
</body>
</html>
HTML;
}
