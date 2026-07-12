#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSErrorDomain const AURAFaceAnalysisMediaSanitizerErrorDomain;

typedef NS_ERROR_ENUM(AURAFaceAnalysisMediaSanitizerErrorDomain,
                      AURAFaceAnalysisMediaSanitizerError) {
  AURAFaceAnalysisMediaSanitizerErrorInvalidURL = 1,
  AURAFaceAnalysisMediaSanitizerErrorSourceUnavailable = 2,
  AURAFaceAnalysisMediaSanitizerErrorDecodeFailed = 3,
  AURAFaceAnalysisMediaSanitizerErrorEncodeFailed = 4,
  AURAFaceAnalysisMediaSanitizerErrorMoveFailed = 5,
};

FOUNDATION_EXPORT NSString *const AURAFaceAnalysisInspectionHasAuxiliaryData;
FOUNDATION_EXPORT NSString *const AURAFaceAnalysisInspectionHasGPS;
FOUNDATION_EXPORT NSString *const AURAFaceAnalysisInspectionHasExif;
FOUNDATION_EXPORT NSString *const AURAFaceAnalysisInspectionIsUpright;
FOUNDATION_EXPORT NSString *const AURAFaceAnalysisInspectionIsSRGB;

FOUNDATION_EXPORT NSURL *_Nullable AURAFaceAnalysisSanitizeImageURL(
    NSURL *_Nullable sourceURL, NSError *_Nullable *_Nullable error);

FOUNDATION_EXPORT NSDictionary<NSString *, NSNumber *> *_Nullable
AURAFaceAnalysisInspectImageURL(NSURL *_Nullable imageURL,
                                NSError *_Nullable *_Nullable error);

NS_ASSUME_NONNULL_END
