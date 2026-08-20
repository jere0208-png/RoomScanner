#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(RoomScanModule, NSObject)
RCT_EXTERN_METHOD(isSupported:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(startRoomScan:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(startAdditionalScan:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopRoomScan:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(poserAuViseur:(NSString *)kind
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(retirerDerniereAncre:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(pauseRoomScan)
RCT_EXTERN_METHOD(resumeRoomScan)
RCT_EXTERN_METHOD(cameraStatus:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestCamera:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setTorch:(BOOL)on resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(RoomScanEvents, RCTEventEmitter)
@end

@interface RCT_EXTERN_MODULE(RoomScanHaptics, NSObject)
RCT_EXTERN_METHOD(tap:(NSString *)kind)
@end

@interface RCT_EXTERN_MODULE(RoomScanAccount, NSObject)
RCT_EXTERN_METHOD(accountMarker:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setAccountMarker:(NSString *)json
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(appleSignIn:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(purchasePro:(NSString *)productId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(restorePro:(NSString *)productId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(webAuth:(NSString *)url
                  scheme:(NSString *)scheme
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(RoomScanPhoto, NSObject)
RCT_EXTERN_METHOD(takePhoto:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(deletePhotos:(NSArray *)paths
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(readPhoto:(NSString *)path
                  maxSide:(nonnull NSNumber *)maxSide
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(RoomScanHeading, NSObject)
RCT_EXTERN_METHOD(start:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(heading:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(RoomScanExport, NSObject)
RCT_EXTERN_METHOD(sharePDF:(NSString *)base64
                  filename:(NSString *)filename
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(shareText:(NSString *)content
                  filename:(NSString *)filename
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(shareFile:(NSString *)path
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(RoomScanViewManager, RCTViewManager)
@end
