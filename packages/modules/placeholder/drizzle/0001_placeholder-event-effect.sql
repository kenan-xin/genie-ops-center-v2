CREATE TABLE "placeholder_event_effect" (
	"handler" text NOT NULL,
	"event_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "placeholder_event_effect_handler_event_id_pk" PRIMARY KEY("handler","event_id")
);
