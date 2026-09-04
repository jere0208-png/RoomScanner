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

// Tenir l'ecran allume pendant la presentation client : voir RoomScanEcran.
@interface RCT_EXTERN_MODULE(RoomScanEcran, NSObject)
RCT_EXTERN_METHOD(garderEveille:(BOOL)oui)
@end

// Quatre habits pour le meme glyphe : voir RoomScanIcone.
@interface RCT_EXTERN_MODULE(RoomScanIcone, NSObject)
RCT_EXTERN_METHOD(poser:(NSString *)nom
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
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
RCT_EXTERN_METHOD(proExpiry:(NSArray *)productIds
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(webAuth:(NSString *)url
                  scheme:(NSString *)scheme
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(RoomScanPhoto, NSObject)
RCT_EXTERN_METHOD(cleanModels:(NSArray *)gardes
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(takePhoto:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(deletePhotos:(NSArray *)paths
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(readPhoto:(NSString *)path
                  maxSide:(nonnull NSNumber *)maxSide
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(restorePhoto:(NSString *)assetId
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

/*
  LE CANEVAS DE LA VUE 3D — une seule vue pour tout le modele, la ou l on
  posait une vue par face. Les formes voyagent en NOMBRES (un tableau plat)
  et les styles en clair, chacun dit une seule fois : ce qui traverse le
  pont soixante fois par seconde doit se lire sans etre analyse.
*/
@interface RCT_EXTERN_MODULE(RoomScanCanvasManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(formes, NSArray)
RCT_EXPORT_VIEW_PROPERTY(styles, NSArray)
@end

/*
  LE TELEMETRE LASER — un emetteur : c est l appareil qui parle quand on
  appuie sur SON bouton, pas l application qui l interroge.
*/
@interface RCT_EXTERN_MODULE(RoomScanLaser, RCTEventEmitter)
RCT_EXTERN_METHOD(chercher:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(arreter:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(connecter:(NSString *)identifiant
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(deconnecter:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end

/*
  LE SERVICE CLIENT — le composeur d'iOS, rempli d'avance, et le choix
  d'une image pour la piece jointe. C'est l'utilisateur qui appuie sur
  « Envoyer » : rien ne part dans son dos.
*/
@interface RCT_EXTERN_MODULE(RoomScanSupport, NSObject)
RCT_EXTERN_METHOD(composeMail:(NSString *)destinataire
                  subject:(NSString *)subject
                  body:(NSString *)body
                  attachment:(NSString *)attachment
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(pickImage:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end
