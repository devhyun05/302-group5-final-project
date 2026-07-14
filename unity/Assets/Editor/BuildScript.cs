using System;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.Management;

namespace ARMakeup.EditorTools
{
    /// <summary>
    /// One-shot project setup + UaaL (Unity as a Library) export for the RN app.
    /// Also callable headless:
    ///   Unity -batchmode -quit -projectPath unity -buildTarget Android \
    ///         -executeMethod ARMakeup.EditorTools.BuildScript.ExportAndroid
    /// </summary>
    public static class BuildScript
    {
        const string BundleId = "com.jungle.armakeup";
        const string ScenePath = "Assets/Scenes/Main.unity";
        // Relative to the unity/ project root → matches the paths
        // @azesmway/react-native-unity expects: <rn-root>/unity/builds/...
        const string AndroidExportPath = "builds/android";
        const string IOSExportPath = "builds/ios-xcode";

        [MenuItem("AR Makeup/1. Setup Project (run once)")]
        public static void SetupProject()
        {
            EnsureScene();

            PlayerSettings.companyName = "Jungle";
            PlayerSettings.productName = "AR Makeup";

            // iOS
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, BundleId);
            PlayerSettings.iOS.cameraUsageDescription = "얼굴 필터를 적용하려면 카메라 접근이 필요합니다.";
            PlayerSettings.iOS.targetOSVersionString = "15.0";
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.iOS, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.iOS, new[] { GraphicsDeviceType.Metal });

            // Android
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, BundleId);
            PlayerSettings.Android.minSdkVersion = (AndroidSdkVersions)26;
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.OpenGLES3 });

            EnableXRLoader(BuildTargetGroup.iOS, "UnityEngine.XR.ARKit.ARKitLoader");
            EnableXRLoader(BuildTargetGroup.Android, "UnityEngine.XR.ARCore.ARCoreLoader");
            TryEnableARKitFaceTracking();

            // ARKit 패키지의 빌드 프로세서는 이 디파인이 켜진 채로 에디터 코드가
            // 컴파일되어야 libUnityARKit.a를 빌드에 포함시킨다. 배치모드에서는
            // 패키지가 스스로 설정하지 못하므로(LoaderEnabledCheck가 배치모드에서
            // 조기 반환) 여기서 영속화한다. 단, "같은" 배치 세션에서는 에디터
            // 어셈블리가 이미 컴파일된 뒤라 효력이 없으므로, 익스포트는 반드시
            // Setup과 별도의 Unity 세션에서 실행할 것 (scripts/export-unity-*.sh 참고).
            EnsureScriptingDefine(NamedBuildTarget.iOS, "UNITY_XR_ARKIT_LOADER_ENABLED");

            AssetDatabase.SaveAssets();
            Debug.Log("[BuildScript] Project setup complete.");
        }

        [MenuItem("AR Makeup/2. Export Android (unityLibrary)")]
        public static void ExportAndroid()
        {
            SetupProject();
            EditorUserBuildSettings.exportAsGoogleAndroidProject = true;

            var report = BuildPipeline.BuildPlayer(
                new[] { ScenePath }, AndroidExportPath, BuildTarget.Android, BuildOptions.None);
            ThrowOnFailure(report, "Android");

            PatchUnityLibraryManifest();
            Debug.Log($"[BuildScript] Android export done → {Path.GetFullPath(AndroidExportPath)}");
        }

        [MenuItem("AR Makeup/3. Export iOS (Xcode project)")]
        public static void ExportIOS()
        {
            SetupProject();

            var report = BuildPipeline.BuildPlayer(
                new[] { ScenePath }, IOSExportPath, BuildTarget.iOS, BuildOptions.None);
            ThrowOnFailure(report, "iOS");

            Debug.Log($"[BuildScript] iOS export done → {Path.GetFullPath(IOSExportPath)}\n" +
                      "Next: run scripts/build-ios-framework.sh to produce UnityFramework.framework.");
        }

        static void ThrowOnFailure(BuildReport report, string platform)
        {
            if (report.summary.result != BuildResult.Succeeded)
                throw new Exception($"[BuildScript] {platform} export failed: {report.summary.result}");
        }

        static void EnsureScriptingDefine(NamedBuildTarget target, string define)
        {
            var current = PlayerSettings.GetScriptingDefineSymbols(target);
            var defines = current.Split(';');
            if (Array.IndexOf(defines, define) >= 0) return;

            var updated = string.IsNullOrEmpty(current) ? define : current + ";" + define;
            PlayerSettings.SetScriptingDefineSymbols(target, updated);
            Debug.Log($"[BuildScript] Scripting define added for {target.TargetName}: {define}");
        }

        static void EnsureScene()
        {
            if (!File.Exists(ScenePath))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
                // The scene stays empty on purpose — ARBootstrap builds everything at runtime.
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
            }

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        static void EnableXRLoader(BuildTargetGroup group, string loaderTypeName)
        {
            try
            {
                var perBuildTarget = GetOrCreateXRSettings();
                var settings = perBuildTarget.SettingsForBuildTarget(group);
                if (settings == null)
                {
                    settings = ScriptableObject.CreateInstance<XRGeneralSettings>();
                    settings.name = $"{group} Settings";
                    AssetDatabase.AddObjectToAsset(settings, AssetDatabase.GetAssetPath(perBuildTarget));
                    perBuildTarget.SetSettingsForBuildTarget(group, settings);
                }

                if (settings.Manager == null)
                {
                    var manager = ScriptableObject.CreateInstance<XRManagerSettings>();
                    manager.name = $"{group} Providers";
                    AssetDatabase.AddObjectToAsset(manager, AssetDatabase.GetAssetPath(perBuildTarget));
                    settings.Manager = manager;
                }

                if (!XRPackageMetadataStore.AssignLoader(settings.Manager, loaderTypeName, group))
                    Debug.LogWarning($"[BuildScript] Could not assign {loaderTypeName} for {group}. " +
                                     "Enable it manually: Project Settings > XR Plug-in Management.");
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[BuildScript] XR loader setup failed for {group}: {e.Message}\n" +
                                 "Enable the provider manually in Project Settings > XR Plug-in Management.");
            }
        }

        static XRGeneralSettingsPerBuildTarget GetOrCreateXRSettings()
        {
            EditorBuildSettings.TryGetConfigObject(
                XRGeneralSettings.k_SettingsKey, out XRGeneralSettingsPerBuildTarget settings);
            if (settings != null) return settings;

            if (!AssetDatabase.IsValidFolder("Assets/XR"))
                AssetDatabase.CreateFolder("Assets", "XR");

            settings = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
            AssetDatabase.CreateAsset(settings, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
            EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, settings, true);
            return settings;
        }

        // The ARKit settings type lives in the ARKit package's editor assembly;
        // reflection keeps this compiling even if the package layout changes.
        static void TryEnableARKitFaceTracking()
        {
            try
            {
                var type = Type.GetType("UnityEditor.XR.ARKit.ARKitSettings, Unity.XR.ARKit.Editor");
                var getOrCreate = type?.GetMethod("GetOrCreateSettings",
                    BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                var settings = getOrCreate?.Invoke(null, null);
                var faceTracking = type?.GetProperty("faceTracking",
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);

                if (settings != null && faceTracking != null && faceTracking.CanWrite)
                {
                    faceTracking.SetValue(settings, true);
                    EditorUtility.SetDirty((UnityEngine.Object)settings);
                    Debug.Log("[BuildScript] ARKit Face Tracking enabled.");
                    return;
                }
            }
            catch (Exception)
            {
                // fall through to the manual instruction below
            }

            Debug.LogWarning("[BuildScript] Could not toggle ARKit Face Tracking automatically. " +
                             "Check Project Settings > XR Plug-in Management > Apple ARKit > Face Tracking.");
        }

        static void PatchUnityLibraryManifest()
        {
            var manifestPath = Path.Combine(AndroidExportPath, "unityLibrary/src/main/AndroidManifest.xml");
            if (!File.Exists(manifestPath))
            {
                Debug.LogWarning($"[BuildScript] {manifestPath} not found — skip manifest patch.");
                return;
            }

            // The embedded unityLibrary must not declare a launcher activity of its own.
            var xml = File.ReadAllText(manifestPath);
            var patched = Regex.Replace(xml, @"<intent-filter>[\s\S]*?</intent-filter>", string.Empty);
            if (patched != xml)
            {
                File.WriteAllText(manifestPath, patched);
                Debug.Log("[BuildScript] Removed <intent-filter> from unityLibrary AndroidManifest.xml.");
            }
        }
    }
}
