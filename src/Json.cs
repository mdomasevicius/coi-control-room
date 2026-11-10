using System.Globalization;
using System.Text;

namespace ControlRoom;

/// <summary>Minimal JSON builder for route responses. Call sites manage commas with <see cref="Sep"/>.</summary>
internal sealed class Json {

	private readonly StringBuilder m_sb = new();
	private bool m_needsComma;

	public Json Obj() { Sep(); m_sb.Append('{'); m_needsComma = false; return this; }
	public Json EndObj() { m_sb.Append('}'); m_needsComma = true; return this; }
	public Json Arr() { Sep(); m_sb.Append('['); m_needsComma = false; return this; }
	public Json EndArr() { m_sb.Append(']'); m_needsComma = true; return this; }

	/// <summary>Writes `"name":` so the next value belongs to it.</summary>
	public Json Key(string name) { Sep(); Str(name); m_sb.Append(':'); m_needsComma = false; return this; }

	public Json Val(string value) { Sep(); if (value == null) { m_sb.Append("null"); } else { Str(value); } m_needsComma = true; return this; }
	public Json Val(bool value) { Sep(); m_sb.Append(value ? "true" : "false"); m_needsComma = true; return this; }
	public Json Val(int value) { Sep(); m_sb.Append(value.ToString(CultureInfo.InvariantCulture)); m_needsComma = true; return this; }

	/// <summary>Numbers are rounded to 3 decimals; that's finer than the game's own UI shows.</summary>
	public Json Val(double value) {
		Sep();
		m_sb.Append(double.IsNaN(value) || double.IsInfinity(value) ? "null" : System.Math.Round(value, 3).ToString("0.###", CultureInfo.InvariantCulture));
		m_needsComma = true;
		return this;
	}

	public Json Prop(string name, string value) => Key(name).Val(value);
	public Json Prop(string name, bool value) => Key(name).Val(value);
	public Json Prop(string name, int value) => Key(name).Val(value);
	public Json Prop(string name, double value) => Key(name).Val(value);

	public override string ToString() => m_sb.ToString();

	private void Sep() {
		if (m_needsComma) {
			m_sb.Append(',');
		}
		m_needsComma = false;
	}

	private void Str(string s) {
		m_sb.Append('"');
		foreach (char c in s) {
			switch (c) {
				case '"': m_sb.Append("\\\""); break;
				case '\\': m_sb.Append("\\\\"); break;
				case '\n': m_sb.Append("\\n"); break;
				case '\r': m_sb.Append("\\r"); break;
				case '\t': m_sb.Append("\\t"); break;
				default:
					if (c < 0x20 || c == (char)0x2028 || c == (char)0x2029) {
						m_sb.Append("\\u").Append(((int)c).ToString("x4"));
					} else {
						m_sb.Append(c);
					}
					break;
			}
		}
		m_sb.Append('"');
	}
}
