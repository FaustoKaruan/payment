import React, { useState, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { View, Image } from "react-native";
import DeFiModal from "../../components/util/DeFiModal";
import Loading from "../../components/util/Loading";
import UserEdit from "../../components/edit/UserEdit";
import { SpacerV } from "../../elements/Spacers";
import { H2 } from "../../elements/Texts";
import withSession from "../../hocs/withSession";
import {
  AccountType,
  kycCompleted,
  kycInProgress,
  KycState,
  KycStatus,
  User,
  UserDetail,
  UserStatus,
} from "../../models/User";
import { getRoutes, getSettings, getUserDetail, postFounderCertificate, postKyc } from "../../services/ApiService";
import AppStyles from "../../styles/AppStyles";
import { Session } from "../../services/AuthService";
import RouteList from "./RouteList";
import AppLayout from "../../components/AppLayout";
import NotificationService from "../../services/NotificationService";
import { DataTable, Dialog, Paragraph, Portal, Text } from "react-native-paper";
import { CompactCell, CompactRow } from "../../elements/Tables";
import { useDevice } from "../../hooks/useDevice";
import { DeFiButton } from "../../elements/Buttons";
import useLoader from "../../hooks/useLoader";
import { BuyRoute } from "../../models/BuyRoute";
import { SellRoute } from "../../models/SellRoute";
import { pickDocuments, resolve } from "../../utils/Utils";
import useAuthGuard from "../../hooks/useAuthGuard";
import Colors from "../../config/Colors";
import { Environment } from "../../env/Environment";
import ClipboardService from "../../services/ClipboardService";
import { ApiError } from "../../models/ApiDto";
import IconButton from "../../components/util/IconButton";
import { TouchableOpacity } from "react-native-gesture-handler";
import RefFeeEdit from "../../components/edit/RefFeeEdit";
import { navigate } from "../../utils/NavigationHelper";
import Routes from "../../config/Routes";
import { StakingRoute } from "../../models/StakingRoute";
import withSettings from "../../hocs/withSettings";
import { AppSettings } from "../../services/SettingsService";
import KycInit from "../../components/KycInit";
import LimitEdit from "../../components/edit/LimitEdit";

const formatAmount = (amount?: number): string => amount?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") ?? "";

const HomeScreen = ({ session, settings }: { session?: Session; settings?: AppSettings }) => {
  const { t } = useTranslation();
  const device = useDevice();
  const RefUrl = Environment.api.refUrl;
  const [isLoading, setLoading] = useState(true);
  const [user, setUser] = useState<UserDetail>();
  const [buyRoutes, setBuyRoutes] = useState<BuyRoute[]>();
  const [sellRoutes, setSellRoutes] = useState<SellRoute[]>();
  const [stakingRoutes, setStakingRoutes] = useState<StakingRoute[]>();
  const [isUserEdit, setIsUserEdit] = useState(false);
  const [isBuyRouteEdit, setIsBuyRouteEdit] = useState(false);
  const [isSellRouteEdit, setIsSellRouteEdit] = useState(false);
  const [isStakingRouteEdit, setIsStakingRouteEdit] = useState(false);
  const [isKycRequest, setIsKycRequest] = useState(false);
  const [isLimitRequest, setIsLimitRequest] = useState(false);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [isKycInit, setIsKycInit] = useState(false);
  const [isRefFeeEdit, setIsRefFeeEdit] = useState(false);

  const [isVotingOpen, setIsVotingOpen] = useState(false);
  const [canVote, setCanVote] = useState(false);
  const [votingImageWidth, setVotingImageWidth] = useState(0);

  const sellRouteEdit = (update: SetStateAction<boolean>) => {
    if (resolve(update, isSellRouteEdit) && !user?.identDataComplete) {
      setIsUserEdit(true);
    }

    setIsSellRouteEdit(update);
  };

  const stakingRouteEdit = (update: SetStateAction<boolean>) => {
    if (resolve(update, isStakingRouteEdit)) {
      // check if user has KYC
      if (user?.kycStatus === KycStatus.NA) {
        return user.status === UserStatus.ACTIVE
          ? onIncreaseLimit()
          : NotificationService.error(t("feedback.bank_tx_required"));
      } else if (user?.kycStatus === KycStatus.CHECK || user?.kycState === KycState.REVIEW) {
        return NotificationService.error(t("model.kyc.kyc_review"));
      } else if (kycInProgress(user?.kycStatus)) {
        return goToIdent();
      }
    } else {
      // reload all routes after close (may impact sell routes)
      loadRoutes();
    }

    setIsStakingRouteEdit(update);
  };

  const userEdit = (edit: boolean) => {
    setIsUserEdit(edit);
    if (!edit) {
      setIsSellRouteEdit(false);
      setIsKycRequest(false);
    }
  };

  const onUserChanged = (newUser: UserDetail) => {
    // reload all routes (may impact fee)
    if (user?.usedRef !== newUser.usedRef) loadRoutes();

    setUser(newUser);
    setIsUserEdit(false);
  };

  const onIncreaseLimit = () => {
    if (user?.kycStatus === KycStatus.NA) {
      // start KYC
      if (!user?.identDataComplete) {
        setIsUserEdit(true);
      }
      setIsKycRequest(true);
    } else {
      // increase limit
      setIsLimitRequest(true);
    }
  };

  const startKyc = async () => {
    const doStartKyc = user?.accountType === AccountType.BUSINESS ? await uploadFounderCertificate() : true;
    setIsKycRequest(false);
    if (doStartKyc) await requestKyc();
  };

  const uploadFounderCertificate = (): Promise<boolean> => {
    return pickDocuments({ type: "public.item", multiple: false })
      .then((files) => {
        setIsFileUploading(true);
        return postFounderCertificate(files);
      })
      .then(() => true)
      .catch(() => {
        NotificationService.error(t("feedback.file_error"));
        return false;
      })
      .finally(() => setIsFileUploading(false));
  };

  const requestKyc = (): Promise<void> => {
    setIsKycInit(true);

    return postKyc()
      .then(goToIdent)
      .catch(() => NotificationService.error(t("feedback.request_failed")))
      .finally(() => setIsKycInit(false));
  };

  const goToIdent = (code: string | undefined = user?.kycHash) => navigate(Routes.Ident, { code: code ?? "" });

  const onRefFeeChanged = (fee: number): void => {
    if (user) user.refFeePercent = fee;
    setIsRefFeeEdit(false);
  };

  const reset = (): void => {
    setLoading(true);
    setUser(undefined);
    setBuyRoutes(undefined);
    setSellRoutes(undefined);
    setIsUserEdit(false);
  };

  const loadRoutes = (): Promise<void> => {
    return getRoutes().then((routes) => {
      setBuyRoutes(routes.buy);
      setSellRoutes(routes.sell);
      setStakingRoutes(routes.staking);
      setCanVote(routes.staking.find((r) => r.balance >= 100) != null);
    });
  };

  useLoader(
    (cancelled) => {
      if (session) {
        if (session.isLoggedIn) {
          Promise.all([getUserDetail(), loadRoutes(), getSettings()])
            .then(([user, _, settings]) => {
              if (!cancelled()) {
                setUser(user);
                setIsVotingOpen(settings.cfpVotingOpen);
              }
            })
            .catch((e: ApiError) =>
              // auto logout
              e.statusCode != 401 ? NotificationService.error(t("feedback.load_failed")) : undefined
            )
            .finally(() => {
              if (!cancelled()) {
                setLoading(false);
              }
            });
        } else {
          reset();
        }
      }
    },
    [session]
  );

  useAuthGuard(session);

  const limit = (user: User): string => {
    if (kycCompleted(user.kycStatus)) {
      return `${formatAmount(user.depositLimit)} € ${t("model.user.per_year")}`;
    } else {
      return `${formatAmount(900)} € ${t("model.user.per_day")}`;
    }
  };

  const buyVolume = () => (buyRoutes ?? []).reduce((prev, curr) => prev + curr.volume, 0);
  const annualBuyVolume = () => (buyRoutes ?? []).reduce((prev, curr) => prev + curr.annualVolume, 0);
  const sellVolume = () => (sellRoutes ?? []).reduce((prev, curr) => prev + curr.volume, 0);

  const getKycStatusString = (status: KycStatus, state: KycState): string => {
    if (kycInProgress(status)) {
      return `${t("model.kyc." + state.toLowerCase())} (${t("model.kyc." + status.toLowerCase())})`;
    } else {
      return t(`model.kyc.${status.toLowerCase()}`);
    }
  };

  const userData = (user: User) => [
    { condition: Boolean(user.address), label: "model.user.address", value: user.address },
    { condition: true, label: "model.user.mail", value: user.mail, emptyHint: t("model.user.add_mail") },
    { condition: Boolean(user.mobileNumber), label: "model.user.mobile_number", value: user.mobileNumber },
    { condition: Boolean(user.usedRef), label: "model.user.used_ref", value: user.usedRef },
    {
      condition: Boolean(buyVolume()),
      label: "model.user.buy_volume",
      value: `${formatAmount(buyVolume())} €`,
    },
    {
      condition: Boolean(annualBuyVolume()),
      label: "model.user.annual_buy_volume",
      value: `${formatAmount(annualBuyVolume())} €`,
    },
    {
      condition: Boolean(sellVolume()),
      label: "model.user.sell_volume",
      value: `${formatAmount(sellVolume())} €`,
    },
    {
      condition: user.kycStatus != KycStatus.NA,
      label: "model.kyc.status",
      value: getKycStatusString(user.kycStatus, user.kycState),
      icon: kycInProgress(user.kycStatus) && user.kycState !== KycState.REVIEW ? "reload" : undefined,
      onPress: () => goToIdent(),
    },
    {
      condition: true,
      label: "model.user.limit",
      value: limit(user),
      icon: user.kycStatus === KycStatus.NA || kycCompleted(user.kycStatus) ? "arrow-up" : undefined,
      onPress: onIncreaseLimit,
    },
  ];

  const refData = (user: UserDetail) => [
    {
      condition: Boolean(user.ref),
      label: "model.user.own_ref",
      value: user.ref,
      icon: "content-copy",
      onPress: () => ClipboardService.copy(`${RefUrl}${user.ref}`),
    },
    {
      condition: Boolean(user.ref),
      label: "model.user.ref_commission",
      value: `${user.refFeePercent}%`,
      icon: "chevron-right",
      onPress: () => setIsRefFeeEdit(true),
    },
    { condition: Boolean(user.refCount), label: "model.user.ref_count", value: user.refCount },
    {
      condition: Boolean(user.refCountActive),
      label: "model.user.ref_count_active",
      value: user.refCountActive,
    },
    {
      condition: Boolean(user.refVolume),
      label: "model.user.ref_volume",
      value: `${formatAmount(user.refVolume)} €`,
    },
    {
      condition: Boolean(user.refCredit),
      label: "model.user.ref_bonus",
      value: `${formatAmount(user.paidRefCredit)} €`,
    },
  ];

  return (
    <AppLayout>
      <Portal>
        <Dialog visible={isKycRequest && !isUserEdit} onDismiss={() => setIsKycRequest(false)} style={AppStyles.dialog}>
          <Dialog.Content>
            <Paragraph>
              {t(user?.accountType === AccountType.BUSINESS ? "model.kyc.request_business" : "model.kyc.request")}
            </Paragraph>
          </Dialog.Content>
          <Dialog.Actions>
            <DeFiButton onPress={() => setIsKycRequest(false)} color={Colors.Grey}>
              {t("action.abort")}
            </DeFiButton>
            <DeFiButton onPress={startKyc} loading={isFileUploading}>
              {t(user?.accountType !== AccountType.BUSINESS ? "action.yes" : "action.upload")}
            </DeFiButton>
          </Dialog.Actions>
        </Dialog>

        <KycInit isVisible={isKycInit} setIsVisible={setIsKycInit} />
      </Portal>

      <DeFiModal
        isVisible={isLimitRequest}
        setIsVisible={setIsLimitRequest}
        title={t("model.kyc.increase_limit")}
        style={{ width: 400 }}
      >
        <LimitEdit onSuccess={() => setIsLimitRequest(false)} />
      </DeFiModal>

      <DeFiModal
        isVisible={isUserEdit}
        setIsVisible={userEdit}
        title={t(isSellRouteEdit || isKycRequest ? "model.user.edit" : "model.user.settings")}
        style={{ width: 500 }}
      >
        <UserEdit user={user} onUserChanged={onUserChanged} identDataEdit={isSellRouteEdit || isKycRequest} />
      </DeFiModal>

      <DeFiModal
        isVisible={isRefFeeEdit}
        setIsVisible={setIsRefFeeEdit}
        title={t("model.user.ref_commission_edit")}
        style={{ width: 400 }}
      >
        <RefFeeEdit
          currentRefFee={user?.refFeePercent ?? 0}
          onRefFeeChanged={onRefFeeChanged}
          onCancel={() => setIsRefFeeEdit(false)}
        />
      </DeFiModal>

      {isVotingOpen && canVote && (
        <View onLayout={(event) => setVotingImageWidth(event.nativeEvent.layout.width)}>
          <TouchableOpacity onPress={() => navigate(Routes.Cfp)}>
            <Image
              style={{ width: votingImageWidth, height: votingImageWidth / 3 }}
              source={
                settings?.language === "DE"
                  ? require("../../assets/voting_2202_de.svg")
                  : require("../../assets/voting_2202_en.svg")
              }
            />
          </TouchableOpacity>
        </View>
      )}

      {!settings?.isIframe && <SpacerV height={30} />}

      {isLoading && <Loading size="large" />}

      {!isLoading && (
        <>
          {user && (
            <View>
              <View style={[AppStyles.containerHorizontal]}>
                <H2 text={t("model.user.your_data")} />
                <IconButton icon="cog" style={AppStyles.mla} size={30} onPress={() => setIsUserEdit(true)} />
              </View>
              <SpacerV />
              <DataTable>
                {userData(user).map(
                  (d) =>
                    d.condition && (
                      <TouchableOpacity onPress={d.onPress} key={d.label} disabled={!d.icon || device.SM}>
                        <CompactRow>
                          <CompactCell multiLine>{t(d.label)}</CompactCell>
                          <View style={{ flex: device.SM ? 2 : 1, flexDirection: "row" }}>
                            <CompactCell multiLine>
                              <Text style={!d.value && { color: Colors.Yellow }}>
                                {d.value ? d.value : d.emptyHint}
                              </Text>
                            </CompactCell>
                            {d.icon && (
                              <CompactCell style={{ flex: undefined }}>
                                <IconButton icon={d.icon} onPress={device.SM ? d.onPress : undefined} />
                              </CompactCell>
                            )}
                          </View>
                        </CompactRow>
                      </TouchableOpacity>
                    )
                )}
              </DataTable>
              <SpacerV />

              {refData(user).some((d) => d.condition) && (
                <>
                  <SpacerV height={50} />
                  <H2 text={t("model.user.your_ref_data")} />
                  <SpacerV />
                  <DataTable>
                    {refData(user).map(
                      (d) =>
                        d.condition && (
                          <TouchableOpacity onPress={d.onPress} key={d.label} disabled={!d.icon || device.SM}>
                            <CompactRow>
                              <CompactCell multiLine style={{ flex: 3 }}>
                                {t(d.label)}
                              </CompactCell>
                              <View style={{ flex: 2, flexDirection: "row" }}>
                                <CompactCell>{d.value}</CompactCell>
                                {d.icon && (
                                  <CompactCell style={{ flex: undefined }}>
                                    <IconButton icon={d.icon} onPress={device.SM ? d.onPress : undefined} />
                                  </CompactCell>
                                )}
                              </View>
                            </CompactRow>
                          </TouchableOpacity>
                        )
                    )}
                  </DataTable>
                </>
              )}
            </View>
          )}

          <SpacerV height={50} />

          {(buyRoutes || sellRoutes) && (
            <RouteList
              user={user}
              buyRoutes={buyRoutes}
              setBuyRoutes={setBuyRoutes}
              sellRoutes={sellRoutes}
              setSellRoutes={setSellRoutes}
              stakingRoutes={stakingRoutes}
              setStakingRoutes={setStakingRoutes}
              isBuyRouteEdit={isBuyRouteEdit}
              setIsBuyRouteEdit={setIsBuyRouteEdit}
              isSellRouteEdit={isSellRouteEdit && !isUserEdit}
              setIsSellRouteEdit={sellRouteEdit}
              isStakingRouteEdit={isStakingRouteEdit}
              setIsStakingRouteEdit={stakingRouteEdit}
            />
          )}
        </>
      )}
    </AppLayout>
  );
};

export default withSettings(withSession(HomeScreen));
