import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { CloseIcon, ArchiveIcon, Tabs } from "lowcoder-design";
import { AppSnapshotIcon } from "lowcoder-design";
import {
  fetchSnapshotDslAction,
  fetchSnapshotsAction,
  setSelectSnapshotId,
  setShowAppSnapshot,
} from "redux/reduxActions/appSnapshotActions";
import dayjs from "dayjs";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { currentApplication } from "redux/selectors/applicationSelector";
import {
  appSnapshotCountSelector,
  appSnapshotsSelector,
  isAppSnapshotDslFetching,
  isAppSnapshotsFetching,
} from "redux/selectors/appSnapshotSelector";
import { default as Skeleton } from "antd/es/skeleton";
import { TacoPagination } from "lowcoder-design";
import { AppSnapshotContext, AppSnapshotList } from "constants/applicationConstants";
import { ExtraActionType } from "lowcoder-core";
import { formatString } from "util/stringUtils";
import { getUser } from "redux/selectors/usersSelectors";
import { ScrollBar } from "lowcoder-design";
import { RightPanelWrapper } from "pages/common/styledComponent";
import { Layers } from "constants/Layers";
import { useMount } from "react-use";
import { timestampToHumanReadable } from "util/dateTimeUtils";
import { AppSnapshotDslInfo } from "api/appSnapshotApi";
import { EmptyContent } from "components/EmptyContent";
import { AppSummaryInfo } from "redux/reduxActions/applicationActions";
import { useRootCompInstance } from "./useRootCompInstance";
import { TopHeaderHeight } from "constants/style";
import { SnapshotItemProps, SnapshotList } from "../../components/SnapshotList";
import { trans } from "i18n";
import EditorSkeletonView from "./editorSkeletonView";
import React from "react";

const AppEditorInternalView = lazy(
  () => import("pages/editor/appEditorInternal")
    .then((moduleExports) => ({default: moduleExports.AppEditorInternalView}))
);

const AppSnapshotPanel = styled(RightPanelWrapper)`
  position: fixed;
  z-index: ${Layers.historySnapshotPanel};
  top: ${TopHeaderHeight};
  right: 0;
  height: calc(100vh - ${TopHeaderHeight});
`;

const headerHeight = 46;
const footerHeight = 76;

const SnapshotHeader = styled.div`
  font-weight: 500;
  font-size: 14px;
  color: #222222;
  line-height: 14px;
  height: ${headerHeight}px;
  background: #f5f5f6;
  display: flex;
  align-items: center;
  padding: 16px;
`;

const SnapshotContent = styled.div`
  padding: 0 8px 8px 8px !important;

  > div {
    margin-top: 8px;
  }
`;

const SnapshotFooter = styled.div`
  padding: 20px 16px 32px 16px;
  height: ${footerHeight}px;
  display: flex;
  justify-content: center;
  position: absolute;
  bottom: 0;
  width: 100%;
`;

const StyledSnapshotIcon = styled(AppSnapshotIcon)`
  margin-right: 4px;
`;

const StyledSnapshotArchiveIcon = styled(ArchiveIcon)`
  margin-right: 4px;
`;

const StyledCloseIcon = styled(CloseIcon)`
  margin-left: auto;
  cursor: pointer;

  &:hover {
    g line {
      stroke: #4965f2;
    }
  }
`;

const SnapshotOperationDesc: Record<ExtraActionType, string> = {
  layout: trans("history.layout"),
  delete: trans("history.delete"),
  add: trans("history.add"),
  modify: trans("history.modify"),
  rename: trans("history.rename"),
  recover: trans("history.recover"),
  upgrade: trans("history.upgrade"),
};

function getOperationDesc(context: AppSnapshotContext) {
  let desc = context.operations
    .slice(0, 5)
    .map((o) => {
      if (o.operation === "recover" && !o.snapshotCreateTime) {
        return trans("history.recoverVersion");
      }
      const desc = SnapshotOperationDesc[o.operation];
      return formatString(
        desc,
        o.compName,
        o.oldName || "",
        o.snapshotCreateTime ? dayjs(o.snapshotCreateTime).format(TIME_FORMAT) : ""
      );
    })
    .join(", ");
  if (context.operations.length > 5) {
    desc += trans("history.andSoOn");
  }
  return desc;
}

const PAGE_SIZE = 10;
const CURRENT_ITEM_KEY = "current_key";
const TIME_FORMAT = trans("history.timeFormat");

export const AppSnapshot = React.memo((props: { currentAppInfo: AppSummaryInfo }) => {
  const { currentAppInfo } = props;
  const currentDsl = currentAppInfo.dsl;
  const dispatch = useDispatch();
  const application = useSelector(currentApplication);
  const appSnapshots = useSelector(appSnapshotsSelector);
  const totalCount = useSelector(appSnapshotCountSelector);
  const snapshotsFetching = useSelector(isAppSnapshotsFetching);
  const [currentPage, setCurrentPage] = useState(1);
  const user = useSelector(getUser);
  const [selectedItemKey, setSelectedItemKey] = useState(CURRENT_ITEM_KEY);
  const [latestDslChanged, setLatestDslChanged] = useState(false);
  const [latestDsl, setLatestDsl] = useState<AppSnapshotDslInfo>();
  const [appInfo, setAppInfo] = useState<AppSummaryInfo>(currentAppInfo);
  const isSnapshotDslLoading = useSelector(isAppSnapshotDslFetching);
  const compInstance = useRootCompInstance(appInfo, true, true);
  const [activeTab, setActiveTab] = useState("recent");

  const isArchivedSnapshot = useMemo(() => activeTab === 'archive', [activeTab]);

  const fetchSnapshotList = useCallback((page: number, onSuccess?: (snapshots: AppSnapshotList) => void) => {
    dispatch(setSelectSnapshotId("", isArchivedSnapshot));
    application &&
      dispatch(
        fetchSnapshotsAction({
          applicationId: application.applicationId,
          page: page,
          size: PAGE_SIZE,
          archived: isArchivedSnapshot,
          onSuccess: onSuccess,
        })
      );
  }, [application, activeTab]);


  useEffect(() => {
    if (!application) {
      return;
    }
    fetchSnapshotList(1, (snapshots) => {
      if (!snapshots.list || snapshots.list.length === 0) {
        return;
      }
      dispatch(
        fetchSnapshotDslAction(
          application.applicationId,
          snapshots.list[0].snapshotId,
          isArchivedSnapshot,
          (res) => {
            setLatestDsl(res);
          }
        )
      );
    });
  }, [application, activeTab]);

  useEffect(() => {
    currentDsl &&
      latestDsl &&
      setLatestDslChanged(JSON.stringify(currentDsl) !== JSON.stringify(latestDsl.applicationsDsl));
  }, [latestDsl, currentDsl]);

  const onSnapshotItemClick = useCallback(
    (snapshotId: string) => {
      if (selectedItemKey === snapshotId) {
        return;
      }
      setSelectedItemKey(snapshotId);
      dispatch(setSelectSnapshotId(
        snapshotId === CURRENT_ITEM_KEY ? "" : snapshotId,
        isArchivedSnapshot,
      ));
      if (snapshotId === CURRENT_ITEM_KEY) {
        setAppInfo(currentAppInfo);
        return;
      }
      if (!application) {
        return;
      }
      dispatch(
        fetchSnapshotDslAction(
          application.applicationId,
          snapshotId,
          isArchivedSnapshot,
          (dsl) => {
            setAppInfo((i) => ({
              ...i,
              dsl: dsl.applicationsDsl,
              moduleDsl: dsl.moduleDSL,
            }));
          }
        )
      );
    },
    [application, currentAppInfo, dispatch, setAppInfo, selectedItemKey, activeTab]
  );

  const snapShotContent = useMemo(() => {
    if (snapshotsFetching || (currentPage === 1 && appSnapshots.length > 0 && !latestDsl)) {
      return <Skeleton style={{ padding: "0 16px" }} active paragraph={{ rows: 10 }} />;
    } else if (appSnapshots.length <= 0 || !application) {
      return <EmptyContent text={trans("history.emptyHistory")} />;
    } else {
      let snapshotItems: SnapshotItemProps[] = appSnapshots.map((snapshot, index) => {
        return {
          selected: selectedItemKey === snapshot.snapshotId,
          title:
            `${
              !latestDslChanged && currentPage === 1 && index === 0
                ? trans("history.currentVersionWithBracket")
                : ""
            }` + getOperationDesc(snapshot.context),
          timeInfo: timestampToHumanReadable(snapshot.createTime),
          userName: snapshot.userName,
          onClick: () => {
            onSnapshotItemClick(snapshot.snapshotId);
          },
        };
      });
      if (currentPage === 1 && latestDslChanged) {
        snapshotItems = [
          {
            selected: selectedItemKey === CURRENT_ITEM_KEY,
            title: trans("history.currentVersion"),
            timeInfo: trans("history.justNow"),
            userName: user.username,
            onClick: () => {
              onSnapshotItemClick(CURRENT_ITEM_KEY);
            },
          },
          ...snapshotItems,
        ];
      }
      return <SnapshotList items={snapshotItems} />;
    }
  }, [
    user,
    snapshotsFetching,
    currentPage,
    appSnapshots,
    latestDsl,
    application,
    selectedItemKey,
    latestDslChanged,
    onSnapshotItemClick,
  ]);

  const TabContent = useMemo(() => (
    <>
      <ScrollBar height={`calc(100% - ${headerHeight + footerHeight}px)`}>
        <SnapshotContent>{snapShotContent}</SnapshotContent>
      </ScrollBar>
      <SnapshotFooter>
        <TacoPagination
          current={currentPage}
          showLessItems
          onChange={(page) => {
            setCurrentPage(page);
            fetchSnapshotList(page);
          }}
          total={totalCount}
          pageSize={PAGE_SIZE}
          showSizeChanger={false}
        />
      </SnapshotFooter>
    </>
  ), [headerHeight, footerHeight, snapShotContent, currentPage, totalCount]);

  const tabConfigs = useMemo(() => [
    {
      key: "recent",
      title: "Recent",
      icon: <StyledSnapshotIcon />,
      content: TabContent,
    },
    {
      key: "archive",
      title: "Archive",
      icon: <StyledSnapshotArchiveIcon />,
      content: TabContent,
    }
  ], [TabContent]);

  return (
    <Suspense fallback={<EditorSkeletonView />}>
      <AppEditorInternalView
        appInfo={appInfo}
        loading={isSnapshotDslLoading}
        readOnly={true}
        compInstance={compInstance}
      />
      <AppSnapshotPanel>
        <Tabs
          onChange={(key) => {
            setActiveTab(key);
          }}
          tabsConfig={tabConfigs}
          activeKey={activeTab}
        />
      </AppSnapshotPanel>
    </Suspense>
  );
});
