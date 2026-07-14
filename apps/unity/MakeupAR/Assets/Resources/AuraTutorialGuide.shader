Shader "AURA/TutorialGuide"
{
    Properties
    {
        _Opacity ("Master Opacity", Range(0, 1)) = 0.86
        _Pulse ("Pulse", Float) = 1
        _Dash ("Dash", Float) = 1
        _EdgeSoft ("Edge Softness", Range(0, 1)) = 0.35
    }

    SubShader
    {
        Tags { "Queue" = "Overlay" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            Blend SrcAlpha OneMinusSrcAlpha

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            float _Opacity;
            float _Pulse;
            float _Dash;
            float _EdgeSoft;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
                fixed4 color : COLOR;
            };

            struct v2f
            {
                float4 position : SV_POSITION;
                float2 uv : TEXCOORD0;
                fixed4 color : COLOR;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.uv = input.uv;
                output.color = input.color;
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                float edgeDistance = abs(input.uv.y * 2.0 - 1.0);
                float feather = smoothstep(1.0, _EdgeSoft, edgeDistance);
                float pulse = lerp(1.0, 0.65 + 0.35 * sin(_Time.y * 3.0), _Pulse);
                float phase = frac(input.uv.x * 24.0 - _Time.y * 1.35);
                float dash = lerp(1.0, smoothstep(0.44, 0.56, phase), _Dash);
                float alpha = input.color.a * _Opacity * feather * pulse * dash;
                return fixed4(input.color.rgb, alpha);
            }
            ENDCG
        }
    }

    FallBack Off
}
