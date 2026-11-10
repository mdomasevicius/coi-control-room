using Mafi;
using Mafi.Core.Mods;

namespace ControlRoom;

/// <summary>
/// Mod entry point. The game creates one instance on load.
/// The web routes live in <see cref="WebRoutes"/>, which the game finds on its own because it is a global dependency.
/// </summary>
public sealed class ControlRoomMod : DataOnlyMod {

	public ControlRoomMod(ModManifest manifest) : base(manifest) {
		Log.Info("ControlRoom: loaded");
	}

	public override void RegisterPrototypes(ProtoRegistrator registrator) {
		// No new buildings, products or recipes.
	}
}
