using System;
using UnityEngine;

public sealed class MakeupRegionDebugControls : MonoBehaviour
{
    [SerializeField] private RNBridge rnBridge;

    private GUIStyle buttonStyle;
    private GUIStyle panelStyle;
    private GUIStyle titleStyle;
    private string lastAppliedRegion = "none";
    private long lastAppliedAtMs;

    private void Awake()
    {
        ResolveBridge();
    }

    private void OnGUI()
    {
        EnsureStyles();

        float scale = Mathf.Max(1.0f, Mathf.Min(Screen.width, Screen.height) / 390.0f);
        float margin = 16.0f * scale;
        float panelWidth = Mathf.Min(Screen.width - margin * 2.0f, 520.0f * scale);
        float buttonHeight = 54.0f * scale;
        float gap = 10.0f * scale;
        float panelHeight = 286.0f * scale;
        Rect panelRect = new Rect(margin, Screen.height - panelHeight - margin, panelWidth, panelHeight);

        GUI.Box(panelRect, GUIContent.none, panelStyle);

        GUILayout.BeginArea(new Rect(
            panelRect.x + margin,
            panelRect.y + margin,
            panelRect.width - margin * 2.0f,
            panelRect.height - margin * 2.0f));

        GUILayout.Label("Makeup AR Test", titleStyle);
        GUILayout.Space(gap);

        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Lip", buttonStyle, GUILayout.Height(buttonHeight)))
        {
            ApplyRegion("lip");
        }

        GUILayout.Space(gap);
        if (GUILayout.Button("Cheek", buttonStyle, GUILayout.Height(buttonHeight)))
        {
            ApplyRegion("cheek");
        }

        GUILayout.Space(gap);
        if (GUILayout.Button("Brow", buttonStyle, GUILayout.Height(buttonHeight)))
        {
            ApplyRegion("brow");
        }
        GUILayout.EndHorizontal();

        GUILayout.Space(gap);
        GUILayout.BeginHorizontal();
        if (GUILayout.Button("All", buttonStyle, GUILayout.Height(buttonHeight)))
        {
            ApplyAllRegions();
        }

        GUILayout.Space(gap);
        if (GUILayout.Button("Clear", buttonStyle, GUILayout.Height(buttonHeight)))
        {
            ClearRegions();
        }
        GUILayout.EndHorizontal();

        GUILayout.Space(gap);
        GUILayout.Label("Last: " + lastAppliedRegion + " @ " + lastAppliedAtMs.ToString(), titleStyle);

        GUILayout.EndArea();
    }

    private void ApplyRegion(string region)
    {
        ApplyRecipe(BuildRecipeJson(region, false));
        Remember(region);
    }

    private void ApplyAllRegions()
    {
        ApplyRecipe(BuildRecipeJson("all", true));
        Remember("all");
    }

    private void ClearRegions()
    {
        ApplyRecipe(BuildClearRecipeJson());
        Remember("clear");
    }

    private void ApplyRecipe(string json)
    {
        ResolveBridge();
        if (rnBridge == null)
        {
            Debug.LogWarning("[debug-controls] RNBridge not found; recipe skipped.");
            return;
        }

        rnBridge.ApplyRecipeJson(json);
    }

    private void ResolveBridge()
    {
        if (rnBridge == null)
        {
            rnBridge = FindFirstObjectByType<RNBridge>();
        }
    }

    private void Remember(string region)
    {
        lastAppliedRegion = region;
        lastAppliedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    private static string BuildRecipeJson(string activeRegion, bool enableAll)
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return "{"
            + "\"version\":1,"
            + "\"lookId\":\"unity_debug_lip_cheek_brow\","
            + "\"recipeBatchId\":\"unity-debug-" + activeRegion + "-" + now.ToString() + "\","
            + "\"sentAtMs\":" + now.ToString() + ","
            + "\"activeRegions\":\"" + activeRegion + "\","
            + "\"layerCount\":3,"
            + "\"enabledLayerCount\":" + (enableAll ? "3" : "1") + ","
            + "\"rendererMode\":\"smooth-region-mask\","
            + "\"layers\":["
            + BuildLayer("lip", activeRegion == "lip" || enableAll, "#D94B74", "gradient_lip", "lip-drawn-style-atlas-v1", 0.62f, 0.64f, 0.32f)
            + ","
            + BuildLayer("cheek", activeRegion == "cheek" || enableAll, "#E67B5F", "soft_blush", "cheek-daily-mask-v1", 0.46f, 0.64f, 0.32f)
            + ","
            + BuildLayer("brow", activeRegion == "brow" || enableAll, "#4A342B", "natural_brow", "brow-png-dailyflat-sharp-v1", 0.58f, 0.74f, 0.42f)
            + "]}";
    }

    private static string BuildClearRecipeJson()
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return "{"
            + "\"version\":1,"
            + "\"lookId\":\"unity_debug_lip_cheek_brow\","
            + "\"recipeBatchId\":\"unity-debug-clear-" + now.ToString() + "\","
            + "\"sentAtMs\":" + now.ToString() + ","
            + "\"activeRegions\":\"none\","
            + "\"layerCount\":3,"
            + "\"enabledLayerCount\":0,"
            + "\"rendererMode\":\"smooth-region-mask\","
            + "\"layers\":["
            + BuildLayer("lip", false, "#D94B74", "gradient_lip", "lip-drawn-style-atlas-v1", 0.0f, 0.64f, 0.32f)
            + ","
            + BuildLayer("cheek", false, "#E67B5F", "soft_blush", "cheek-daily-mask-v1", 0.0f, 0.64f, 0.32f)
            + ","
            + BuildLayer("brow", false, "#4A342B", "natural_brow", "brow-png-dailyflat-sharp-v1", 0.0f, 0.74f, 0.42f)
            + "]}";
    }

    private static string BuildLayer(
        string region,
        bool enabled,
        string color,
        string texture,
        string maskTextureId,
        float opacity,
        float coverage,
        float feather)
    {
        return "{"
            + "\"id\":\"debug-" + region + "\","
            + "\"region\":\"" + region + "\","
            + "\"color\":\"" + color + "\","
            + "\"opacity\":" + opacity.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture) + ","
            + "\"texture\":\"" + texture + "\","
            + "\"textureMode\":\"sample\","
            + "\"blendMode\":\"normal\","
            + "\"rendererMode\":\"smooth-region-mask\","
            + "\"enabled\":" + enabled.ToString().ToLowerInvariant() + ","
            + "\"intensity\":" + (enabled ? "1" : "0") + ","
            + "\"coverage\":" + coverage.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture) + ","
            + "\"feather\":" + feather.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture) + ","
            + "\"maskTextureId\":\"" + maskTextureId + "\""
            + "}";
    }

    private void EnsureStyles()
    {
        if (buttonStyle != null)
        {
            return;
        }

        buttonStyle = new GUIStyle(GUI.skin.button)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 22,
            fontStyle = FontStyle.Bold
        };
        buttonStyle.normal.textColor = Color.white;
        buttonStyle.active.textColor = Color.white;
        buttonStyle.hover.textColor = Color.white;

        panelStyle = new GUIStyle(GUI.skin.box);
        panelStyle.normal.background = MakeTexture(new Color(0.03f, 0.03f, 0.04f, 0.78f));

        titleStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.MiddleLeft,
            fontSize = 20,
            fontStyle = FontStyle.Bold
        };
        titleStyle.normal.textColor = Color.white;
    }

    private static Texture2D MakeTexture(Color color)
    {
        Texture2D texture = new Texture2D(1, 1);
        texture.SetPixel(0, 0, color);
        texture.Apply();
        return texture;
    }
}
