using UnityEngine;
using UnityEngine.XR.ARFoundation;

namespace ARMakeup.Face
{
    /// <summary>
    /// Grafts the ARwithFable MediaPipe LIP renderer into AURA's EXISTING AR
    /// scene. AURA already owns the ARSession / XROrigin / ARCameraManager +
    /// ARCameraBackground, so this does NOT create a second AR rig or camera
    /// background — it only attaches, to AURA's AR camera:
    ///   - FaceLandmarkSource : runs MediaPipe FaceLandmarker (478pt) on the AR
    ///     Foundation camera CPU frames.
    ///   - FramePresenter     : used ONLY for ImageToViewport() coordinate
    ///     mapping; its background quad renderer is disabled so AURA's live
    ///     ARCameraBackground stays visible (pilot accepts the small landmark
    ///     latency instead of the reference's time-synced FramePresenter bg).
    ///   - LipRenderer        : the reference lip contour ring mesh + Lip.shader
    ///     (GrabPass _CameraFeed luma-preserving tint of the real lips).
    /// AURA's own lip overlay is suppressed by RNBridge when a lip recipe lands.
    /// </summary>
    public sealed class AuraMediaPipeGraftBootstrap : MonoBehaviour
    {
        static bool _spawned;
        static AuraTutorialGuide _tutorialGuide;
        bool _wired;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Spawn()
        {
            if (_spawned)
            {
                return;
            }
            _spawned = true;
            var go = new GameObject("AuraMediaPipeGraft");
            DontDestroyOnLoad(go);
            go.AddComponent<AuraMediaPipeGraftBootstrap>();
            var guideObject = new GameObject("AuraTutorialGuide");
            guideObject.transform.SetParent(go.transform, false);
            _tutorialGuide = guideObject.AddComponent<AuraTutorialGuide>();
            Debug.Log("[AuraMediaPipeGraft] bootstrap spawned, waiting for AR camera");
        }

        void Update()
        {
            if (_wired)
            {
                return;
            }

            var camManager = FindAnyObjectByType<ARCameraManager>();
            if (camManager == null)
            {
                return;
            }
            var cam = camManager.GetComponent<Camera>();
            if (cam == null)
            {
                cam = Camera.main;
            }
            if (cam == null)
            {
                return;
            }

            // FramePresenter: ImageToViewport() only. Disable the quad renderer so
            // it never draws over AURA's live camera background.
            if (camManager.GetComponent<FramePresenter>() == null)
            {
                var presenter = camManager.gameObject.AddComponent<FramePresenter>();
                presenter.Init(cam);
                var quad = presenter.GetComponent<MeshRenderer>();
                if (quad != null)
                {
                    quad.enabled = false;
                }
                // AURA's front (selfie) AR camera.
                presenter.SetUserFacing(true);
            }

            // FaceLandmarkSource: MediaPipe on the AR Foundation camera frames.
            if (camManager.GetComponent<FaceLandmarkSource>() == null)
            {
                camManager.gameObject.AddComponent<FaceLandmarkSource>().Init(camManager);
            }

            // LipRenderer: reference lip mesh + Lip.shader.
            var lipGO = new GameObject("Aura Lip Renderer");
            var source = camManager.GetComponent<FaceLandmarkSource>();
            lipGO.AddComponent<LipRenderer>().Init(cam, source);

            // Stable UnitySendMessage receiver for the RN guide lane. It is
            // created at bootstrap time, so guide state can arrive before the
            // AR camera is ready; Init attaches the renderer once landmarks exist.
            if (_tutorialGuide == null)
            {
                var guideObject = new GameObject("AuraTutorialGuide");
                guideObject.transform.SetParent(transform, false);
                _tutorialGuide = guideObject.AddComponent<AuraTutorialGuide>();
            }
            _tutorialGuide.Init(cam, source);

            _wired = true;
            Debug.Log("[AuraMediaPipeGraft] MediaPipe lip + tutorial guide wired to AURA AR camera");
        }
    }
}
