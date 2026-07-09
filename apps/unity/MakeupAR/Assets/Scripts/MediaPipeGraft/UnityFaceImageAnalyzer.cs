using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Unity.Collections;
using UnityEngine;
#if MEDIAPIPE
using Mediapipe;
using Mediapipe.Tasks.Vision.FaceLandmarker;
using Mediapipe.Unity;
#endif

namespace ARMakeup.Face
{
    public sealed class UnityFaceImageAnalyzer : MonoBehaviour
    {
        public const string SchemaVersion = "aura-unity-face-analysis-v1";
        public const string EventType = "unity_face_image_analysis";

        public static UnityFaceImageAnalyzer Instance { get; private set; }

        public delegate void FaceImageAnalysisEventSink(string eventJson);

        [Serializable]
        private sealed class FaceImageAnalysisRequest
        {
            public string cameraFacing;
            public string captureId;
            public string imageUri;
            public string requestId;
            public string schemaVersion;
            public string sessionId;
            public string type;
            public int rotationDegrees;
        }

        private struct NormalizedPoint
        {
            public int Index;
            public float X;
            public float Y;
            public float Z;
        }

#if MEDIAPIPE
        private FaceLandmarker landmarker;
        private bool preparing;
        private bool ready;
        private string initError;
#endif

        private void Awake()
        {
            Instance = this;
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
#if MEDIAPIPE
            try
            {
                landmarker?.Close();
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[UnityFaceImageAnalyzer] landmarker close failed: " + exception.Message);
            }
            landmarker = null;
#endif
        }

        private IEnumerator Start()
        {
#if MEDIAPIPE
            yield return EnsureReady();
#else
            yield break;
#endif
        }

        public void AnalyzeJson(string json, FaceImageAnalysisEventSink sink)
        {
            StartCoroutine(AnalyzeJsonCoroutine(json, sink));
        }

        private IEnumerator AnalyzeJsonCoroutine(string json, FaceImageAnalysisEventSink sink)
        {
            FaceImageAnalysisRequest request = null;
            try
            {
                if (string.IsNullOrWhiteSpace(json))
                {
                    throw new ArgumentException("Face image analysis JSON is empty.");
                }

                request = JsonUtility.FromJson<FaceImageAnalysisRequest>(json);
                ValidateRequest(request);
            }
            catch (Exception exception)
            {
                EmitEvent(sink, BuildEventJson(
                    request,
                    "failed",
                    0,
                    0,
                    0,
                    0,
                    null,
                    exception.Message));
                yield break;
            }

#if MEDIAPIPE
            yield return EnsureReady();

            if (!ready || landmarker == null)
            {
                EmitEvent(sink, BuildEventJson(
                    request,
                    "unsupported",
                    0,
                    0,
                    0,
                    0,
                    null,
                    string.IsNullOrEmpty(initError) ? "mediapipe_landmarker_unavailable" : initError));
                yield break;
            }

            Texture2D texture = null;
            NativeArray<byte> pixelBuffer = default;
            try
            {
                texture = LoadTexture(request.imageUri);
                pixelBuffer = BuildRgbaBuffer(texture);
                var image = new Image(
                    ImageFormat.Types.Format.Srgba,
                    texture.width,
                    texture.height,
                    texture.width * 4,
                    pixelBuffer);
                var processing = new Mediapipe.Tasks.Vision.Core.ImageProcessingOptions(
                    rotationDegrees: NormalizeRotationDegrees(request.rotationDegrees));
                FaceLandmarkerResult result = landmarker.Detect(image, processing);

                var faces = result.faceLandmarks;
                var faceCount = faces != null ? faces.Count : 0;
                if (faceCount <= 0)
                {
                    EmitEvent(sink, BuildEventJson(
                        request,
                        "no_face",
                        0,
                        texture.width,
                        texture.height,
                        faceCount,
                        null,
                        null));
                    yield break;
                }

                var face = faces[0].landmarks;
                var points = new Vector3[face.Count];
                for (var i = 0; i < face.Count; i++)
                {
                    var landmark = face[i];
                    points[i] = new Vector3(landmark.x, landmark.y, landmark.z);
                }

                EmitEvent(sink, BuildEventJson(
                    request,
                    "ok",
                    points.Length,
                    texture.width,
                    texture.height,
                    faceCount,
                    points,
                    null));
            }
            catch (Exception exception)
            {
                EmitEvent(sink, BuildEventJson(
                    request,
                    "failed",
                    0,
                    texture != null ? texture.width : 0,
                    texture != null ? texture.height : 0,
                    0,
                    null,
                    exception.Message));
            }
            finally
            {
                if (pixelBuffer.IsCreated)
                {
                    pixelBuffer.Dispose();
                }
                if (texture != null)
                {
                    Destroy(texture);
                }
            }
#else
            EmitEvent(sink, BuildEventJson(
                request,
                "unsupported",
                0,
                0,
                0,
                0,
                null,
                "mediapipe_unavailable"));
            yield break;
#endif
        }

#if MEDIAPIPE
        private IEnumerator EnsureReady()
        {
            if (ready || !string.IsNullOrEmpty(initError))
            {
                yield break;
            }

            if (preparing)
            {
                while (preparing)
                {
                    yield return null;
                }
                yield break;
            }

            preparing = true;
            Mediapipe.Unity.IResourceManager resources = new StreamingAssetsResourceManager();
            yield return resources.PrepareAssetAsync("face_landmarker.task");

            if (!TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate.GPU) &&
                !TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate.CPU))
            {
                initError = "face_landmarker_create_failed";
            }

            preparing = false;
        }

        private bool TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate inferenceDelegate)
        {
            try
            {
                var options = new FaceLandmarkerOptions(
                    new Mediapipe.Tasks.Core.BaseOptions(
                        inferenceDelegate,
                        modelAssetPath: "face_landmarker.task"),
                    runningMode: Mediapipe.Tasks.Vision.Core.RunningMode.IMAGE,
                    numFaces: 1);

                landmarker = FaceLandmarker.CreateFromOptions(options);
                ready = true;
                initError = null;
                Debug.Log("[UnityFaceImageAnalyzer] MediaPipe FaceLandmarker ready (" + inferenceDelegate + ", IMAGE)");
                return true;
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[UnityFaceImageAnalyzer] " + inferenceDelegate + " delegate failed: " + exception.Message);
                return false;
            }
        }

        private static Texture2D LoadTexture(string imageUri)
        {
            var path = NormalizeLocalPath(imageUri);
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                throw new FileNotFoundException("face_image_not_found", path);
            }

            var bytes = File.ReadAllBytes(path);
            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            if (!texture.LoadImage(bytes, false))
            {
                Destroy(texture);
                throw new InvalidOperationException("face_image_decode_failed");
            }

            return texture;
        }

        private static NativeArray<byte> BuildRgbaBuffer(Texture2D texture)
        {
            var pixels = texture.GetPixels32();
            var buffer = new NativeArray<byte>(pixels.Length * 4, Allocator.Temp);

            for (var i = 0; i < pixels.Length; i++)
            {
                var offset = i * 4;
                var pixel = pixels[i];
                buffer[offset] = pixel.r;
                buffer[offset + 1] = pixel.g;
                buffer[offset + 2] = pixel.b;
                buffer[offset + 3] = pixel.a;
            }

            return buffer;
        }
#endif

        private static void ValidateRequest(FaceImageAnalysisRequest request)
        {
            if (request == null)
            {
                throw new ArgumentException("Face image analysis JSON did not parse into a request.");
            }
            if (request.schemaVersion != SchemaVersion)
            {
                throw new ArgumentException("Unsupported face image analysis schemaVersion: " + NormalizeOptional(request.schemaVersion));
            }
            if (request.type != "face_image_analysis_request")
            {
                throw new ArgumentException("Unsupported face image analysis type: " + NormalizeOptional(request.type));
            }
            if (string.IsNullOrWhiteSpace(request.requestId))
            {
                throw new ArgumentException("Face image analysis requestId is required.");
            }
            if (string.IsNullOrWhiteSpace(request.imageUri))
            {
                throw new ArgumentException("Face image analysis imageUri is required.");
            }
        }

        private static string BuildEventJson(
            FaceImageAnalysisRequest request,
            string status,
            int landmarkCount,
            int imageWidth,
            int imageHeight,
            int faceCount,
            Vector3[] landmarks,
            string error)
        {
            var builder = new StringBuilder(landmarks != null ? 48000 : 512);
            builder.Append("{\"type\":\"").Append(EventType).Append("\"");
            builder.Append(",\"schemaVersion\":\"").Append(SchemaVersion).Append("\"");
            builder.Append(",\"status\":\"").Append(EscapeJsonString(status)).Append("\"");
            builder.Append(",\"requestId\":\"").Append(EscapeJsonString(request != null ? request.requestId : "unknown")).Append("\"");
            builder.Append(",\"captureId\":\"").Append(EscapeJsonString(request != null ? request.captureId : string.Empty)).Append("\"");
            builder.Append(",\"sessionId\":\"").Append(EscapeJsonString(request != null ? request.sessionId : string.Empty)).Append("\"");
            builder.Append(",\"imageUri\":\"").Append(EscapeJsonString(request != null ? request.imageUri : string.Empty)).Append("\"");
            builder.Append(",\"cameraFacing\":\"").Append(EscapeJsonString(NormalizeCameraFacing(request != null ? request.cameraFacing : null))).Append("\"");
            builder.Append(",\"faceCount\":").Append(faceCount.ToString(CultureInfo.InvariantCulture));
            builder.Append(",\"landmarkCount\":").Append(landmarkCount.ToString(CultureInfo.InvariantCulture));
            builder.Append(",\"imageWidth\":").Append(imageWidth.ToString(CultureInfo.InvariantCulture));
            builder.Append(",\"imageHeight\":").Append(imageHeight.ToString(CultureInfo.InvariantCulture));
            builder.Append(",\"pose\":{\"poseSource\":\"unavailable\"}");

            if (!string.IsNullOrEmpty(error))
            {
                builder.Append(",\"error\":\"").Append(EscapeJsonString(error)).Append("\"");
            }

            if (landmarks != null && landmarks.Length > 0)
            {
                builder.Append(",\"keypoints\":");
                AppendKeypointsJson(builder, landmarks);
                builder.Append(",\"debugPoints\":");
                AppendDebugPointsJson(builder, landmarks);
                builder.Append(",\"landmarks\":");
                AppendLandmarksJson(builder, landmarks);
            }

            builder.Append("}");
            return builder.ToString();
        }

        private static void AppendKeypointsJson(StringBuilder builder, Vector3[] landmarks)
        {
            var first = true;
            builder.Append("{");
            AppendNamedPoint(builder, "hApprox", LandmarkPoint(landmarks, 10), ref first);
            AppendNamedPoint(builder, "glabella", BuildGlabella(landmarks), ref first);
            AppendNamedPoint(builder, "subnasale", BuildSubnasale(landmarks), ref first);
            AppendNamedPoint(builder, "menton", BuildMenton(landmarks), ref first);
            builder.Append("}");
        }

        private static void AppendDebugPointsJson(StringBuilder builder, Vector3[] landmarks)
        {
            var first = true;
            builder.Append("{");
            AppendNamedPoint(builder, "idx9", LandmarkPoint(landmarks, 9), ref first);
            AppendNamedPoint(builder, "idx10", LandmarkPoint(landmarks, 10), ref first);
            AppendNamedPoint(builder, "idx151", LandmarkPoint(landmarks, 151), ref first);
            AppendNamedPoint(builder, "idx234", LandmarkPoint(landmarks, 234), ref first);
            AppendNamedPoint(builder, "idx454", LandmarkPoint(landmarks, 454), ref first);
            AppendNamedPoint(builder, "idx2", LandmarkPoint(landmarks, 2), ref first);
            AppendNamedPoint(builder, "idx97", LandmarkPoint(landmarks, 97), ref first);
            AppendNamedPoint(builder, "idx326", LandmarkPoint(landmarks, 326), ref first);
            AppendNamedPoint(builder, "idx148", LandmarkPoint(landmarks, 148), ref first);
            AppendNamedPoint(builder, "idx152", LandmarkPoint(landmarks, 152), ref first);
            AppendNamedPoint(builder, "idx176", LandmarkPoint(landmarks, 176), ref first);
            AppendNamedPoint(builder, "idx377", LandmarkPoint(landmarks, 377), ref first);
            AppendNamedPoint(builder, "idx400", LandmarkPoint(landmarks, 400), ref first);
            AppendNamedPoint(builder, "leftInnerBrow", AveragePoint(landmarks, new[] {107, 55, 65}), ref first);
            AppendNamedPoint(builder, "rightInnerBrow", AveragePoint(landmarks, new[] {336, 285, 295}), ref first);
            builder.Append("}");
        }

        private static void AppendLandmarksJson(StringBuilder builder, Vector3[] landmarks)
        {
            builder.Append("[");
            for (var i = 0; i < landmarks.Length; i++)
            {
                if (i > 0)
                {
                    builder.Append(",");
                }

                AppendPointJson(builder, new NormalizedPoint
                {
                    Index = i,
                    X = landmarks[i].x,
                    Y = landmarks[i].y,
                    Z = landmarks[i].z,
                });
            }
            builder.Append("]");
        }

        private static void AppendNamedPoint(
            StringBuilder builder,
            string name,
            NormalizedPoint? point,
            ref bool first)
        {
            if (!point.HasValue)
            {
                return;
            }

            if (!first)
            {
                builder.Append(",");
            }
            first = false;
            builder.Append("\"").Append(name).Append("\":");
            AppendPointJson(builder, point.Value);
        }

        private static void AppendPointJson(StringBuilder builder, NormalizedPoint point)
        {
            builder.Append("{\"index\":").Append(point.Index.ToString(CultureInfo.InvariantCulture));
            builder.Append(",\"normalized\":true");
            builder.Append(",\"x\":").Append(FormatNumber(Clamp01(point.X)));
            builder.Append(",\"y\":").Append(FormatNumber(Clamp01(point.Y)));
            builder.Append(",\"z\":").Append(FormatNumber(point.Z));
            builder.Append("}");
        }

        private static NormalizedPoint? BuildGlabella(Vector3[] landmarks)
        {
            var candidates = new List<NormalizedPoint>();
            AddPoint(candidates, LandmarkPoint(landmarks, 9));
            AddPoint(candidates, LandmarkPoint(landmarks, 151));
            AddPoint(candidates, AveragePoint(landmarks, new[] {107, 55, 65}));
            AddPoint(candidates, AveragePoint(landmarks, new[] {336, 285, 295}));
            return MedianPoint(candidates);
        }

        private static NormalizedPoint? BuildSubnasale(Vector3[] landmarks)
        {
            var candidates = new List<NormalizedPoint>();
            AddPoint(candidates, LandmarkPoint(landmarks, 2));
            AddPoint(candidates, LandmarkPoint(landmarks, 97));
            AddPoint(candidates, LandmarkPoint(landmarks, 326));
            return MedianPoint(candidates);
        }

        private static NormalizedPoint? BuildMenton(Vector3[] landmarks)
        {
            var centerCandidates = new List<NormalizedPoint>();
            AddPoint(centerCandidates, LandmarkPoint(landmarks, 148));
            AddPoint(centerCandidates, LandmarkPoint(landmarks, 152));
            AddPoint(centerCandidates, LandmarkPoint(landmarks, 377));

            var bottomCandidates = new List<NormalizedPoint>();
            AddPoint(bottomCandidates, LandmarkPoint(landmarks, 148));
            AddPoint(bottomCandidates, LandmarkPoint(landmarks, 152));
            AddPoint(bottomCandidates, LandmarkPoint(landmarks, 176));
            AddPoint(bottomCandidates, LandmarkPoint(landmarks, 377));
            AddPoint(bottomCandidates, LandmarkPoint(landmarks, 400));

            if (bottomCandidates.Count == 0)
            {
                return null;
            }

            var xs = centerCandidates.Count > 0 ? centerCandidates : bottomCandidates;
            var bottomY = bottomCandidates[0].Y;
            for (var i = 1; i < bottomCandidates.Count; i++)
            {
                bottomY = Mathf.Max(bottomY, bottomCandidates[i].Y);
            }

            return new NormalizedPoint
            {
                Index = -1,
                X = MedianValue(xs, point => point.X),
                Y = bottomY,
                Z = MedianValue(xs, point => point.Z),
            };
        }

        private static void AddPoint(List<NormalizedPoint> points, NormalizedPoint? point)
        {
            if (point.HasValue)
            {
                points.Add(point.Value);
            }
        }

        private static NormalizedPoint? LandmarkPoint(Vector3[] landmarks, int index)
        {
            if (landmarks == null || index < 0 || index >= landmarks.Length)
            {
                return null;
            }

            var point = landmarks[index];
            return new NormalizedPoint
            {
                Index = index,
                X = point.x,
                Y = point.y,
                Z = point.z,
            };
        }

        private static NormalizedPoint? AveragePoint(Vector3[] landmarks, int[] indices)
        {
            var sum = Vector3.zero;
            var count = 0;

            for (var i = 0; i < indices.Length; i++)
            {
                var point = LandmarkPoint(landmarks, indices[i]);
                if (!point.HasValue)
                {
                    continue;
                }

                sum.x += point.Value.X;
                sum.y += point.Value.Y;
                sum.z += point.Value.Z;
                count++;
            }

            if (count == 0)
            {
                return null;
            }

            return new NormalizedPoint
            {
                Index = -1,
                X = sum.x / count,
                Y = sum.y / count,
                Z = sum.z / count,
            };
        }

        private static NormalizedPoint? MedianPoint(List<NormalizedPoint> points)
        {
            if (points == null || points.Count == 0)
            {
                return null;
            }

            return new NormalizedPoint
            {
                Index = -1,
                X = MedianValue(points, point => point.X),
                Y = MedianValue(points, point => point.Y),
                Z = MedianValue(points, point => point.Z),
            };
        }

        private static float MedianValue(List<NormalizedPoint> points, Func<NormalizedPoint, float> selector)
        {
            var values = new List<float>(points.Count);
            for (var i = 0; i < points.Count; i++)
            {
                values.Add(selector(points[i]));
            }
            values.Sort();

            var mid = values.Count / 2;
            if (values.Count % 2 == 1)
            {
                return values[mid];
            }

            return (values[mid - 1] + values[mid]) * 0.5f;
        }

        private static string NormalizeLocalPath(string imageUri)
        {
            if (string.IsNullOrWhiteSpace(imageUri))
            {
                return string.Empty;
            }

            if (imageUri.StartsWith("file://", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    return new Uri(imageUri).LocalPath;
                }
                catch
                {
                    return Uri.UnescapeDataString(imageUri.Substring("file://".Length));
                }
            }

            return imageUri;
        }

        private static int NormalizeRotationDegrees(int rotationDegrees)
        {
            var normalized = ((rotationDegrees % 360) + 360) % 360;
            if (normalized == 90 || normalized == 180 || normalized == 270)
            {
                return normalized;
            }

            return 0;
        }

        private static string NormalizeCameraFacing(string cameraFacing)
        {
            if (cameraFacing == "front" || cameraFacing == "back")
            {
                return cameraFacing;
            }

            return "unknown";
        }

        private static string NormalizeOptional(string value)
        {
            return string.IsNullOrWhiteSpace(value) ? "none" : value;
        }

        private static float Clamp01(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value))
            {
                return 0.0f;
            }

            return Mathf.Clamp01(value);
        }

        private static string FormatNumber(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value))
            {
                return "0";
            }

            return value.ToString("0.######", CultureInfo.InvariantCulture);
        }

        private static string EscapeJsonString(string value)
        {
            return (value ?? string.Empty)
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"");
        }

        private static void EmitEvent(FaceImageAnalysisEventSink sink, string eventJson)
        {
            if (sink != null)
            {
                sink(eventJson);
            }
        }
    }
}
