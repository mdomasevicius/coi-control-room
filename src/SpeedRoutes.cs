using Mafi;
using Mafi.Core.WebApi;
using Mafi.Unity.InputControl;

namespace ControlRoom;

/// <summary>
/// Whether the game offers a speed above 3× and which one, so the dashboard shows the same speed buttons as the game.
/// The game's rule (GameSpeedController): the extra option exists in sandbox games, or once a speed above 3× was set
/// (console: set_game_speed N, N = 4-20); its speed is the last one seen above 3× (sandbox default 12).
/// </summary>
[GlobalDependency(RegistrationMode.AsSelf)]
public sealed class SpeedRoutes {

	private readonly DependencyResolver m_resolver;

	// The controller is UI-side; it is looked up on each request rather than injected, so a missing controller
	// can't break loading the game, it only reports no extra speed.
	public SpeedRoutes(DependencyResolver resolver) {
		m_resolver = resolver;
	}

	[WebRoute("/api/mods/control-room/speed", WebRouteStage.Sync, "GET",
		"Extra game speed the game offers above 3x: { superSpeed: N } or { superSpeed: null } when it offers none.")]
	public WebRouteResponse Speed() {
		var json = new Json().Obj();
		if (m_resolver.TryGetResolvedDependency(out GameSpeedController speed) && speed.HasSuperSpeedOption) {
			json.Prop("superSpeed", speed.LastSeenSuperSpeed);
		} else {
			json.Key("superSpeed").Val((string)null);
		}
		return WebRouteResponse.Json(json.EndObj().ToString());
	}
}
