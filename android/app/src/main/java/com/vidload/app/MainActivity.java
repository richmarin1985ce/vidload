package com.vidload.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Bundled UI, native X metadata resolver, and Android DownloadManager integration. */
public class MainActivity extends Activity {
    private WebView web;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static final Pattern POST = Pattern.compile("^https://(?:www\\.|mobile\\.)?(?:x\\.com|twitter\\.com)/([A-Za-z0-9_]{1,15})/status/(\\d{8,25})(?:[/?#].*)?$");

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(8,11,20));
        getWindow().setNavigationBarColor(Color.rgb(8,11,20));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(8,11,20));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new NativeBridge(), "VidLoadAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme())) return false;
                openExternal(u.toString());
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    private void openExternal(String url) {
        try {
            Uri u = Uri.parse(url);
            if ("https".equals(u.getScheme())) startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception ignored) { }
    }
    private void toast(String text) {
        runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show());
    }
    private void reply(boolean ok, JSONObject data, String error) {
        try {
            JSONObject result = new JSONObject();
            result.put("ok", ok);
            if (data != null) result.put("data", data);
            if (error != null) result.put("error", error);
            String escaped = JSONObject.quote(result.toString());
            runOnUiThread(() -> {
                if (web != null)
                    web.evaluateJavascript("if(window.VidLoadNativeResult)window.VidLoadNativeResult(" + escaped + ");", null);
            });
        } catch (Exception ignored) { }
    }

    private final class NativeBridge {
        @JavascriptInterface public void openUrl(String url) {
            runOnUiThread(() -> openExternal(url));
        }

        @JavascriptInterface public void resolveX(String url) {
            Matcher match = POST.matcher(url == null ? "" : url);
            if (!match.matches()) { reply(false, null, "Enter a public X post URL."); return; }
            String api = "https://api.fxtwitter.com/" + match.group(1) + "/status/" + match.group(2);
            executor.execute(() -> {
                HttpURLConnection conn = null;
                try {
                    conn = (HttpURLConnection) new URL(api).openConnection();
                    conn.setConnectTimeout(12000);
                    conn.setReadTimeout(15000);
                    conn.setRequestProperty("Accept", "application/json");
                    if (conn.getResponseCode() != 200) {
                        reply(false, null, "This public post is not available through the media index.");
                        return;
                    }
                    if (conn.getContentLengthLong() > 2_000_000L) throw new IllegalStateException();
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    byte[] chunk = new byte[8192];
                    int n;
                    try (InputStream input = conn.getInputStream()) {
                        while ((n = input.read(chunk)) != -1) {
                            buffer.write(chunk, 0, n);
                            if (buffer.size() > 2_000_000) throw new IllegalStateException();
                        }
                    }
                    reply(true, new JSONObject(new String(buffer.toByteArray(), StandardCharsets.UTF_8)), null);
                } catch (Exception ignored) {
                    reply(false, null, "Could not reach the public video metadata provider.");
                } finally {
                    if (conn != null) conn.disconnect();
                }
            });
        }

        @JavascriptInterface public void download(String url, String proposedName) {
            runOnUiThread(() -> {
                try {
                    URI u = new URI(url);
                    if (!"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null || u.getUserInfo() != null || u.getPort() != -1)
                        throw new IllegalArgumentException();
                    String filename = proposedName == null ? "VidLoad_video.mp4"
                        : proposedName.replaceAll("[^A-Za-z0-9._-]", "_");
                    if (filename.length() > 120) filename = filename.substring(0, 120);
                    if (filename.isEmpty() || filename.startsWith(".")) filename = "VidLoad_video.mp4";
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.setTitle(filename);
                    request.setDescription("VidLoad video download");
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setMimeType(filename.endsWith(".webm") ? "video/webm" : "video/mp4");
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                    DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    manager.enqueue(request);
                    toast("Downloading to Downloads: " + filename);
                } catch (Exception ignored) {
                    toast("Could not start the download.");
                }
            });
        }
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        executor.shutdownNow();
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
