using System;
using System.Collections;
using System.IO;
using System.Runtime.InteropServices;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// Target-app adapter for ARwithFable's tutorial-stencil experience.
    ///
    /// The original renderer depends on the full ARwithFable MakeupController
    /// graph. AURA already owns the AR session, RNBridge and E3 renderers, so this
    /// focused graft shares the existing MediaPipe landmarks and only draws the
    /// coach lines requested by the React Native guide lane.
    /// </summary>
    public sealed class AuraTutorialGuide : MonoBehaviour
    {
        [Serializable]
        private sealed class GuidePayload
        {
            public bool enabled;
            public float opacity = 0.86f;
            public bool pulse = true;
            public bool dash = true;
            public bool lips;
            public bool brows;
            public bool eyeliner;
            public bool blush;
            public bool midline;
            public bool pairs;
        }

        private static readonly int[] LipsOuter =
            { 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146 };

        private static readonly int[][] BrowUpper =
        {
            new[] { 70, 63, 105, 66, 107 },
            new[] { 300, 293, 334, 296, 336 },
        };

        private static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };

        private static readonly int[][] UpperLids =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362 },
        };

        private static readonly int[] Midline = { 10, 168, 4, 152 };

        private static readonly int[,] SymmetryPairs =
        {
            { 105, 334 },
            { 33, 263 },
            { 129, 358 },
            { 61, 291 },
        };

        private static readonly Color LipColor = new Color(1.00f, 0.35f, 0.55f);
        private static readonly Color BrowColor = new Color(0.62f, 0.44f, 0.30f);
        private static readonly Color EyelinerColor = new Color(0.30f, 0.28f, 0.42f);
        private static readonly Color BlushColor = new Color(1.00f, 0.55f, 0.45f);
        private static readonly Color MidlineColor = new Color(0.50f, 0.85f, 1.00f);
        private static readonly Color SymmetricColor = new Color(0.25f, 0.90f, 0.45f);
        private static readonly Color AsymmetricColor = new Color(1.00f, 0.32f, 0.32f);

        private const int LipSlot = 0;
        private const int BrowSlot = 1;
        private const int EyelinerSlot = 3;
        private const int BlushSlot = 5;
        private const int MidlineSlot = 7;
        private const int PairSlot = 8;
        private const int PairCount = 4;
        private const int SlotCount = 12;
        private const int PointsPerStroke = 36;
        private const float GuideHalfWidthFactor = 0.007f;
        private const float SymmetryHalfWidthFactor = 0.010f;
        private const float DistanceFromCamera = 0.45f;
        private const float DepthScale = 1.0f;
        private const float SymmetryDeviationMax = 0.05f;

        private static readonly int OpacityId = Shader.PropertyToID("_Opacity");
        private static readonly int PulseId = Shader.PropertyToID("_Pulse");
        private static readonly int DashId = Shader.PropertyToID("_Dash");

        private readonly Vector2[] _control = new Vector2[24];
        private readonly Vector2[] _sampled = new Vector2[PointsPerStroke];
        private GuidePayload _payload = new GuidePayload();
        private Camera _camera;
        private FaceLandmarkSource _source;
        private Material _material;
        private Mesh _mesh;
        private MeshRenderer _meshRenderer;
        private Vector3[] _vertices;
        private Color32[] _colors;
        private bool _captureBusy;

#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void sendMessageToMobileApp(string message);
#endif

        public bool IsInitialized { get; private set; }

        public void Init(Camera camera, FaceLandmarkSource source)
        {
            if (IsInitialized || camera == null || source == null)
            {
                return;
            }

            _camera = camera;
            _source = source;

            var shader = Resources.Load<Shader>("AuraTutorialGuide");
            if (shader == null)
            {
                shader = Shader.Find("AURA/TutorialGuide");
            }
            if (shader == null)
            {
                Debug.LogError("[AuraTutorialGuide] tutorial guide shader not found");
                return;
            }

            // Target AURA composites foundation at 4300 and E3 regions at
            // 5000. ARwithFable's original queue 4000 would therefore be
            // overwritten. Stay at Unity's transparent-queue ceiling and use
            // an explicit sorting order so the coach lines remain the final
            // overlay even when an E3 region shares queue 5000.
            _material = new Material(shader) { renderQueue = 5000 };
            _mesh = new Mesh { name = "AuraTutorialGuideMesh" };
            _mesh.MarkDynamic();

            var vertexCount = SlotCount * PointsPerStroke * 2;
            _vertices = new Vector3[vertexCount];
            _colors = new Color32[vertexCount];
            var uvs = new Vector2[vertexCount];
            var triangles = new int[SlotCount * (PointsPerStroke - 1) * 6];

            for (var slot = 0; slot < SlotCount; slot++)
            {
                var vertexBase = slot * PointsPerStroke * 2;
                for (var point = 0; point < PointsPerStroke; point++)
                {
                    var along = point / (float)(PointsPerStroke - 1);
                    uvs[vertexBase + point * 2] = new Vector2(along, 0f);
                    uvs[vertexBase + point * 2 + 1] = new Vector2(along, 1f);
                }

                for (var point = 0; point < PointsPerStroke - 1; point++)
                {
                    var a0 = vertexBase + point * 2;
                    var a1 = a0 + 1;
                    var n0 = vertexBase + (point + 1) * 2;
                    var n1 = n0 + 1;
                    var triangleBase = (slot * (PointsPerStroke - 1) + point) * 6;
                    triangles[triangleBase] = a0;
                    triangles[triangleBase + 1] = a1;
                    triangles[triangleBase + 2] = n0;
                    triangles[triangleBase + 3] = a1;
                    triangles[triangleBase + 4] = n1;
                    triangles[triangleBase + 5] = n0;
                }
            }

            _mesh.vertices = _vertices;
            _mesh.colors32 = _colors;
            _mesh.uv = uvs;
            _mesh.triangles = triangles;

            var meshFilter = gameObject.GetComponent<MeshFilter>();
            if (meshFilter == null)
            {
                meshFilter = gameObject.AddComponent<MeshFilter>();
            }
            meshFilter.sharedMesh = _mesh;

            _meshRenderer = gameObject.GetComponent<MeshRenderer>();
            if (_meshRenderer == null)
            {
                _meshRenderer = gameObject.AddComponent<MeshRenderer>();
            }
            _meshRenderer.sharedMaterial = _material;
            _meshRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _meshRenderer.receiveShadows = false;
            _meshRenderer.sortingOrder = 32760;
            _meshRenderer.enabled = false;

            IsInitialized = true;
            ApplyMaterialState();
            Debug.Log("[AuraTutorialGuide] MediaPipe tutorial guide initialized");
        }

        /// <summary>UnitySendMessage entrypoint used by React Native.</summary>
        public void ApplyJson(string json)
        {
            if (string.IsNullOrEmpty(json))
            {
                return;
            }

            try
            {
                var next = JsonUtility.FromJson<GuidePayload>(json);
                if (next == null)
                {
                    return;
                }
                next.opacity = Mathf.Clamp01(next.opacity);
                _payload = next;
                ApplyMaterialState();
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[AuraTutorialGuide] invalid guide payload: " + exception.Message);
            }
        }

        /// <summary>
        /// UnitySendMessage entrypoint used by the React Native shutter. The
        /// Unity view is composited below React Native controls, so capturing
        /// its framebuffer records the camera + makeup + tutorial lines without
        /// the surrounding application chrome.
        /// </summary>
        public void CapturePhoto(string requestId)
        {
            if (_captureBusy)
            {
                SendCaptureResult(requestId, null, "capture already in progress");
                return;
            }

            StartCoroutine(CapturePhotoRoutine(requestId));
        }

        private IEnumerator CapturePhotoRoutine(string requestId)
        {
            _captureBusy = true;
            yield return new WaitForEndOfFrame();

            Texture2D texture = null;
            try
            {
                texture = ScreenCapture.CaptureScreenshotAsTexture();
                if (texture == null)
                {
                    throw new InvalidOperationException("Unity framebuffer is not ready");
                }

                var fileName = "aura_ar_" + DateTime.Now.ToString("yyyyMMdd_HHmmss_fff") + ".jpg";
                var path = Path.Combine(Application.persistentDataPath, fileName);
                File.WriteAllBytes(path, texture.EncodeToJPG(92));
                SendCaptureResult(requestId, path, null);
            }
            catch (Exception exception)
            {
                Debug.LogError("[AuraTutorialGuide] photo capture failed: " + exception);
                SendCaptureResult(requestId, null, exception.Message);
            }
            finally
            {
                if (texture != null)
                {
                    Destroy(texture);
                }
                _captureBusy = false;
            }
        }

        private static void SendCaptureResult(string requestId, string path, string error)
        {
            var status = string.IsNullOrEmpty(error) ? "ok" : "error";
            var message = "{\"type\":\"ar_photo_captured\",\"requestId\":\"" +
                          EscapeJson(requestId) + "\",\"status\":\"" + status + "\"";
            if (!string.IsNullOrEmpty(path))
            {
                message += ",\"path\":\"" + EscapeJson(path) + "\"";
            }
            if (!string.IsNullOrEmpty(error))
            {
                message += ",\"error\":\"" + EscapeJson(error) + "\"";
            }
            message += "}";

#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                sendMessageToMobileApp(message);
            }
            catch (Exception exception)
            {
                Debug.LogError("[AuraTutorialGuide] capture response failed: " + exception.Message);
            }
#else
            Debug.Log("[AuraTutorialGuide] capture response " + message);
#endif
        }

        private static string EscapeJson(string value)
        {
            return string.IsNullOrEmpty(value)
                ? string.Empty
                : value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        private void ApplyMaterialState()
        {
            if (_material == null)
            {
                return;
            }
            _material.SetFloat(OpacityId, _payload.opacity);
            _material.SetFloat(PulseId, _payload.pulse ? 1f : 0f);
            _material.SetFloat(DashId, _payload.dash ? 1f : 0f);
        }

        private void LateUpdate()
        {
            if (!IsInitialized)
            {
                return;
            }

            var visible = _payload.enabled && _payload.opacity > 0f &&
                          _source != null && _source.HasFace &&
                          FramePresenter.Instance != null;
            if (_meshRenderer.enabled != visible)
            {
                _meshRenderer.enabled = visible;
            }
            if (!visible)
            {
                return;
            }

            var landmarks = _source.Landmarks;
            var eyeSpan = (ImagePoint(landmarks, 263) - ImagePoint(landmarks, 33)).magnitude;
            var guideHalfWidth = Mathf.Max(eyeSpan * GuideHalfWidthFactor, 0.0005f);
            var symmetryHalfWidth = Mathf.Max(eyeSpan * SymmetryHalfWidthFactor, 0.0007f);

            if (_payload.lips)
            {
                CopyLandmarks(landmarks, LipsOuter, _control);
                BuildStroke(LipsOuter.Length, true, guideHalfWidth,
                    AverageDepth(landmarks, LipsOuter), LipSlot, LipColor);
            }
            else
            {
                CollapseSlot(LipSlot);
            }

            for (var side = 0; side < 2; side++)
            {
                if (_payload.brows)
                {
                    var count = 0;
                    for (var i = 0; i < BrowUpper[side].Length; i++)
                    {
                        _control[count++] = ImagePoint(landmarks, BrowUpper[side][i]);
                    }
                    for (var i = BrowLower[side].Length - 1; i >= 0; i--)
                    {
                        _control[count++] = ImagePoint(landmarks, BrowLower[side][i]);
                    }
                    BuildStroke(count, true, guideHalfWidth,
                        AverageDepth(landmarks, BrowUpper[side]), BrowSlot + side, BrowColor);
                }
                else
                {
                    CollapseSlot(BrowSlot + side);
                }

                if (_payload.eyeliner)
                {
                    CopyLandmarks(landmarks, UpperLids[side], _control);
                    BuildStroke(UpperLids[side].Length, false, guideHalfWidth,
                        AverageDepth(landmarks, UpperLids[side]), EyelinerSlot + side, EyelinerColor);
                }
                else
                {
                    CollapseSlot(EyelinerSlot + side);
                }
            }

            if (_payload.blush)
            {
                BuildBlushEllipse(landmarks, 50, eyeSpan, BlushSlot);
                BuildBlushEllipse(landmarks, 280, eyeSpan, BlushSlot + 1);
            }
            else
            {
                CollapseSlot(BlushSlot);
                CollapseSlot(BlushSlot + 1);
            }

            if (_payload.midline)
            {
                CopyLandmarks(landmarks, Midline, _control);
                BuildStroke(Midline.Length, false, symmetryHalfWidth,
                    AverageDepth(landmarks, Midline), MidlineSlot, MidlineColor);
            }
            else
            {
                CollapseSlot(MidlineSlot);
            }

            BuildSymmetryPairs(landmarks, symmetryHalfWidth);

            _mesh.vertices = _vertices;
            _mesh.colors32 = _colors;
            _mesh.RecalculateBounds();
        }

        private void BuildBlushEllipse(Vector3[] landmarks, int centerIndex, float eyeSpan, int slot)
        {
            var center = ImagePoint(landmarks, centerIndex);
            var radiusX = eyeSpan * 0.30f;
            var radiusY = eyeSpan * 0.18f;
            const int controlCount = 20;
            for (var i = 0; i < controlCount; i++)
            {
                var angle = Mathf.PI * 2f * i / controlCount;
                _control[i] = center + new Vector2(Mathf.Cos(angle) * radiusX, Mathf.Sin(angle) * radiusY);
            }
            BuildStroke(controlCount, true, eyeSpan * GuideHalfWidthFactor,
                Depth(landmarks[centerIndex].z), slot, BlushColor);
        }

        private void BuildSymmetryPairs(Vector3[] landmarks, float halfWidth)
        {
            var origin = ImagePoint(landmarks, 10);
            var chin = ImagePoint(landmarks, 152);
            var axisVector = chin - origin;
            var faceHeight = Mathf.Max(axisVector.magnitude, 0.0001f);
            var axis = axisVector / faceHeight;

            for (var pair = 0; pair < PairCount; pair++)
            {
                var slot = PairSlot + pair;
                if (!_payload.pairs)
                {
                    CollapseSlot(slot);
                    continue;
                }

                var leftIndex = SymmetryPairs[pair, 0];
                var rightIndex = SymmetryPairs[pair, 1];
                var left = ImagePoint(landmarks, leftIndex);
                var right = ImagePoint(landmarks, rightIndex);
                var leftAxis = Vector2.Dot(left - origin, axis);
                var rightAxis = Vector2.Dot(right - origin, axis);
                var deviation = Mathf.Abs(leftAxis - rightAxis) / faceHeight;
                var color = Color.Lerp(
                    SymmetricColor,
                    AsymmetricColor,
                    Mathf.Clamp01(deviation / SymmetryDeviationMax));

                _control[0] = left;
                _control[1] = right;
                BuildStroke(2, false, halfWidth,
                    Depth((landmarks[leftIndex].z + landmarks[rightIndex].z) * 0.5f),
                    slot, color);
            }
        }

        private void BuildStroke(
            int count,
            bool closed,
            float halfWidth,
            float depth,
            int slot,
            Color color)
        {
            if (count < 2)
            {
                CollapseSlot(slot);
                return;
            }

            var segmentCount = closed ? count : count - 1;
            for (var point = 0; point < PointsPerStroke; point++)
            {
                var scaled = point / (float)(PointsPerStroke - 1) * segmentCount;
                var segment = Mathf.FloorToInt(scaled);
                if (segment >= segmentCount)
                {
                    segment = segmentCount - 1;
                }
                var t = scaled - segment;

                Vector2 p0;
                Vector2 p1;
                Vector2 p2;
                Vector2 p3;
                if (closed)
                {
                    p0 = _control[(segment - 1 + count) % count];
                    p1 = _control[segment % count];
                    p2 = _control[(segment + 1) % count];
                    p3 = _control[(segment + 2) % count];
                }
                else
                {
                    p0 = _control[Mathf.Max(segment - 1, 0)];
                    p1 = _control[segment];
                    p2 = _control[Mathf.Min(segment + 1, count - 1)];
                    p3 = _control[Mathf.Min(segment + 2, count - 1)];
                }
                _sampled[point] = CatmullRom(p0, p1, p2, p3, t);
            }

            var color32 = (Color32)color;
            var vertexBase = slot * PointsPerStroke * 2;
            for (var point = 0; point < PointsPerStroke; point++)
            {
                var previous = _sampled[Mathf.Max(point - 1, 0)];
                var next = _sampled[Mathf.Min(point + 1, PointsPerStroke - 1)];
                var tangent = next - previous;
                if (tangent.sqrMagnitude < 0.0000001f)
                {
                    tangent = Vector2.right;
                }
                tangent.Normalize();
                var normal = new Vector2(-tangent.y, tangent.x);
                _vertices[vertexBase + point * 2] = ImageToWorld(_sampled[point] + normal * halfWidth, depth);
                _vertices[vertexBase + point * 2 + 1] = ImageToWorld(_sampled[point] - normal * halfWidth, depth);
                var opaqueColor = new Color32(color32.r, color32.g, color32.b, 255);
                _colors[vertexBase + point * 2] = opaqueColor;
                _colors[vertexBase + point * 2 + 1] = opaqueColor;
            }
        }

        private void CollapseSlot(int slot)
        {
            var vertexBase = slot * PointsPerStroke * 2;
            for (var i = 0; i < PointsPerStroke * 2; i++)
            {
                _vertices[vertexBase + i] = Vector3.zero;
                _colors[vertexBase + i] = new Color32(0, 0, 0, 0);
            }
        }

        private static void CopyLandmarks(Vector3[] landmarks, int[] indices, Vector2[] output)
        {
            for (var i = 0; i < indices.Length; i++)
            {
                output[i] = ImagePoint(landmarks, indices[i]);
            }
        }

        private float AverageDepth(Vector3[] landmarks, int[] indices)
        {
            var z = 0f;
            for (var i = 0; i < indices.Length; i++)
            {
                z += landmarks[indices[i]].z;
            }
            return Depth(z / indices.Length);
        }

        private static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t +
                (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2 +
                (3f * p1 - p0 - 3f * p2 + p3) * t3);
        }

        private static Vector2 ImagePoint(Vector3[] landmarks, int index)
        {
            return new Vector2(landmarks[index].x, landmarks[index].y);
        }

        private static float Depth(float z)
        {
            return DistanceFromCamera * (1f + z * DepthScale);
        }

        private Vector3 ImageToWorld(Vector2 imagePoint, float depth)
        {
            var viewportPoint = FramePresenter.Instance.ImageToViewport(imagePoint);
            return _camera.ViewportToWorldPoint(new Vector3(viewportPoint.x, viewportPoint.y, depth));
        }

        private void OnDestroy()
        {
            if (_material != null)
            {
                Destroy(_material);
            }
            if (_mesh != null)
            {
                Destroy(_mesh);
            }
        }
    }
}
