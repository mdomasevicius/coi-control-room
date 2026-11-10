using System.Collections.Generic;
using System.IO;
using Mafi;
using Mafi.Core.WebApi;

namespace ControlRoom;

/// <summary>
/// Serves the control-room dashboard (the web-src/ Svelte app, built with base /control-room/ into web/ and embedded in
/// this DLL) from the game's own web API server, so the page and the API share one origin.
/// All routes only read embedded files, so they run on the Background stage and never touch the simulation.
/// </summary>
[GlobalDependency(RegistrationMode.AsSelf)]
public sealed class WebRoutes {

	private const string PREFIX = "/control-room";

	private readonly Dictionary<string, WebRouteResponse> m_cache = new();

	[WebRoute(PREFIX, WebRouteStage.Background, "GET", "Control Room dashboard (mod).")]
	public WebRouteResponse Index() => Embedded("index.html");

	[WebRoute(PREFIX + "/{file}", WebRouteStage.Background, "GET", "Static files of the Control Room dashboard (mod).")]
	public WebRouteResponse RootFile(string file) => Embedded(file);

	[WebRoute(PREFIX + "/assets/{file}", WebRouteStage.Background, "GET", "Static assets of the Control Room dashboard (mod).")]
	public WebRouteResponse Asset(string file) => Embedded("assets/" + file);

	[WebRoute("/api/mods/control-room/hello", WebRouteStage.Background, "GET", "Health check of the Control Room mod.")]
	public WebRouteResponse Hello() => WebRouteResponse.Json("{\"message\":\"Hello from the ControlRoom mod\"}");

	private WebRouteResponse Embedded(string name) {
		lock (m_cache) {
			if (m_cache.TryGetValue(name, out WebRouteResponse cached)) {
				return cached;
			}
			// Resource names are a fixed set embedded at build time, so any other name (including "../x") just misses.
			using Stream stream = typeof(WebRoutes).Assembly.GetManifestResourceStream("web/" + name);
			if (stream == null) {
				return WebRouteResponse.NotFound($"'{name}' is not part of the Control Room dashboard.");
			}
			using var buffer = new MemoryStream();
			stream.CopyTo(buffer);
			// index.html must be revalidated so a new build is picked up; assets/ names carry a content hash.
			string cache = name.StartsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
			WebRouteResponse response = WebRouteResponse.Bytes(ContentType(name), buffer.ToArray())
				.WithHeader("Cache-Control", cache);
			m_cache[name] = response;
			return response;
		}
	}

	private static string ContentType(string name) {
		switch (Path.GetExtension(name).ToLowerInvariant()) {
			case ".html": return "text/html; charset=utf-8";
			case ".js": return "text/javascript; charset=utf-8";
			case ".css": return "text/css; charset=utf-8";
			case ".json": return "application/json; charset=utf-8";
			case ".svg": return "image/svg+xml";
			case ".png": return "image/png";
			case ".ico": return "image/x-icon";
			case ".woff2": return "font/woff2";
			case ".woff": return "font/woff";
			default: return "application/octet-stream";
		}
	}
}
